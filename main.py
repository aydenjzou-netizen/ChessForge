from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Tuple
from dataclasses import dataclass
import uvicorn
import os
import requests
import time
import re
import json
import logging
import uuid

from coach_rag import CoachRAGEngine

app = FastAPI(title="Chess PGN Viewer")
coach_engine = None
service_logger = logging.getLogger("chessforge.ai_api")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(message)s")


def log_event(level: str, event: str, **fields) -> None:
    record = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "level": level,
        "service": "chessforge-ai-api",
        "event": event,
        **fields,
    }
    getattr(service_logger, level, service_logger.info)(json.dumps(record, default=str))


@app.middleware("http")
async def request_context(request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    started_at = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["x-request-id"] = request_id
        return response
    finally:
        log_event(
            "info",
            "http.request.completed",
            requestId=request_id,
            method=request.method,
            path=request.url.path,
            statusCode=status_code,
            latencyMs=round((time.perf_counter() - started_at) * 1000, 2),
        )

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:mini")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_URL = f"{OLLAMA_BASE_URL}/api/generate"
MAX_PROMPT_CHARS = int(os.getenv("MAX_PROMPT_CHARS", "6000"))

class ChatRequest(BaseModel):
    message: str
    pgn: Optional[str] = None
    aiTextFormat: Optional[str] = None
    fen: Optional[str] = None
    selectedMove: Optional[str] = None
    gameId: Optional[str] = None
    proficiencyLevel: Optional[str] = None

CATEGORIES = {
    "GAME_SUMMARY": "game_summary",
    "ENDGAME_ANALYSIS": "endgame_analysis",
    "WINNING_CONVERSION_ANALYSIS": "winning_conversion_analysis",
    "RESULT_EXPLANATION": "result_explanation",
    "OPENING_ANALYSIS": "opening_analysis",
    "TACTIC_ANALYSIS": "tactic_analysis",
    "MOVE_EXPLANATION": "move_explanation",
    "GENERAL": "general"
}

ANALYST_FEN_INSTRUCTIONS = (
    "The AI text format now includes a FEN after every half-move. Use these FENs to understand "
    "the exact board position after each move. When explaining the game, describe the board using "
    "the FEN evidence when relevant: piece placement, king safety, pawn structure, material, open "
    "files, threats, passed pawns, attacks, and endgame structure. Do not rely only on move notation when a FEN is available.\n\n"
    "Do not quote FEN strings unless the user asks for them. Use the FEN to reason about and describe "
    "the board in natural language."
)

ANALYST_RAG_MINDSET = """
You are a RAG-style Chess Analyst. The current loaded game (PGN / AI text / FENs below) is the ONLY source of truth for factual claims about this game.

MANDATORY WORKFLOW: Retrieve (already provided below) → inspect → reason → answer. Do NOT answer from general chess memory first.

CORE RULES:
1) Evidence-first: Base every factual claim on the retrieved chunks. General chess theory may ONLY help explain ideas already visible in the evidence — it must not replace missing game facts.
2) Inspect FENs in the evidence mentally: piece placement, king safety, material, pawn structure, open files, passed pawns, threats, endgame structure. Do not output raw FEN unless the user asks.
3) Ground your phrasing: tie claims to the evidence (e.g. \"Around half-move …\", \"After White played …\", \"The FEN after this move shows …\", \"The next few moves show …\", \"The result line indicates …\").
4) Guardrails — never: invent moves, tactics, or checkmate not shown; assume an opening name without move evidence; claim a blunder without showing consequence in the evidence; ignore the provided game when it answers the question.
5) If, after using the provided evidence (and any fallback chunks), you still cannot answer factually: say clearly: \"I do not have enough evidence from the current game to answer that fully.\" Do not hallucinate — but do not give up if a wider window or the final phase would suffice.

ANSWER STRUCTURE (use clear headings; for very short questions, keep sections brief but present):
## Direct Answer
## Evidence From the Game
## Reasoning
## Conclusion / Lesson
"""


@dataclass
class AnalystRetrievalResult:
    evidence: List[str]
    strategy: str
    window_label: str
    fen_in_evidence: int
    category: str


def extract_metadata_prefix_lines(ai_text: str) -> List[str]:
    if not ai_text:
        return []
    lines = ai_text.replace("\r\n", "\n").split("\n")
    meta: List[str] = []
    for line in lines:
        if re.fullmatch(r"\d+", line.strip()):
            break
        meta.append(line)
    return [l for l in meta if l.strip()]


def result_lines_from_ai_text(lines: List[str]) -> List[str]:
    return [l for l in lines if l.strip().lower().startswith("result:")]


def count_fens_in_evidence(evidence: List[str]) -> int:
    n = 0
    for e in evidence:
        if e == "...":
            continue
        for part in e.split("\n"):
            if part.strip().lower().startswith("fen:"):
                n += 1
    return n


def halfmove_window(
    move_blocks: List[str],
    center_idx: int,
    before: int = 12,
    after: int = 12,
) -> Tuple[List[str], int, int]:
    """Inclusive half-move indices 1-based for logging."""
    n = len(move_blocks)
    if n == 0:
        return [], 0, 0
    center_idx = max(0, min(n - 1, center_idx))
    start = max(0, center_idx - before)
    end = min(n - 1, center_idx + after)
    return move_blocks[start : end + 1], start + 1, end + 1


def trim_evidence_to_budget(
    evidence: List[str],
    max_chars: int,
    reserve_for_prompt: int = 3200,
) -> List[str]:
    if not evidence:
        return evidence
    budget = max(1500, max_chars - reserve_for_prompt)
    flat = "\n".join(e for e in evidence if e != "...")
    if len(flat) <= budget:
        return evidence
    return [flat[: budget - 60] + "\n[... retrieved evidence truncated for length ...]"]


def extract_halfmove_evidence_blocks(ai_text: str) -> List[str]:
    """One block per half-move: optional full-move number line, side line, optional fen line."""
    if not ai_text or not ai_text.strip():
        return []
    lines = ai_text.replace("\r\n", "\n").split("\n")
    blocks: List[str] = []
    i = 0
    in_move_section = False
    pending_num: Optional[str] = None
    re_legacy = re.compile(r"^\d+\s*:\s*(white|black)\s*:\s*(.+)$", re.I)
    re_side = re.compile(r"^(white|black)\s*:\s*(.+)$", re.I)

    while i < len(lines):
        raw = lines[i]
        t = raw.strip()

        if re.fullmatch(r"\d+", t):
            in_move_section = True
            pending_num = raw
            i += 1
            continue

        if t.lower().startswith("fen:"):
            i += 1
            continue

        lm = re_legacy.match(t)
        if lm:
            in_move_section = True
            parts = [raw]
            i += 1
            if i < len(lines) and lines[i].strip().lower().startswith("fen:"):
                parts.append(lines[i])
                i += 1
            blocks.append("\n".join(parts))
            pending_num = None
            continue

        sm = re_side.match(t)
        if sm:
            if not in_move_section:
                i += 1
                continue
            parts: List[str] = []
            if sm.group(1).lower() == "white" and pending_num is not None:
                parts.append(pending_num)
                pending_num = None
            elif sm.group(1).lower() == "black":
                pending_num = None
            parts.append(raw)
            i += 1
            if i < len(lines) and lines[i].strip().lower().startswith("fen:"):
                parts.append(lines[i])
                i += 1
            blocks.append("\n".join(parts))
            continue

        pending_num = None
        i += 1

    return blocks


def san_from_halfmove_block(block: str) -> str:
    for line in block.split("\n"):
        t = line.strip()
        lm = re.match(r"^\d+\s*:\s*(white|black)\s*:\s*(.+)$", t, re.I)
        if lm:
            return lm.group(2).strip()
        sm = re.match(r"^(white|black)\s*:\s*(.+)$", t, re.I)
        if sm:
            return sm.group(2).strip()
    return ""


def format_evidence_for_prompt(evidence: List[str]) -> str:
    if not evidence:
        return "None provided."
    parts: List[str] = []
    for block in evidence:
        if block == "...":
            parts.append("- ...")
        elif "\n" not in block:
            parts.append(f"- {block}")
        else:
            parts.append("- " + block.replace("\n", "\n  "))
    return "\n".join(parts)


def get_key_move_indices(move_blocks: List[str]) -> List[int]:
    key_indices = []
    for i, block in enumerate(move_blocks):
        san = san_from_halfmove_block(block)
        if any(c in san for c in ["x", "+", "#", "="]):
            key_indices.append(i)
    return key_indices


def merge_intervals(intervals: List[List[int]]) -> List[List[int]]:
    if not intervals:
        return []
    intervals.sort(key=lambda x: x[0])
    merged = [intervals[0]]
    for current in intervals[1:]:
        prev = merged[-1]
        # Merge if overlapping or adjacent (+1)
        if current[0] <= prev[1] + 1:
            prev[1] = max(prev[1], current[1])
        else:
            merged.append(current)
    return merged

def get_summary_evidence(move_blocks: List[str], radius: int = 12) -> Tuple[List[str], str]:
    total_moves = len(move_blocks)
    if total_moves == 0:
        return [], "n/a"

    key_indices = get_key_move_indices(move_blocks)

    if 0 not in key_indices:
        key_indices.append(0)
    if (total_moves - 1) not in key_indices:
        key_indices.append(total_moves - 1)

    key_indices.sort()

    windows = [[max(0, i - radius), min(total_moves - 1, i + radius)] for i in key_indices]
    merged = merge_intervals(windows)

    evidence: List[str] = []
    for start, end in merged:
        if evidence and evidence[-1] != "...":
            evidence.append("...")
        for i in range(start, end + 1):
            evidence.append(move_blocks[i])

    window_label = ",".join(f"{a + 1}-{b + 1}" for a, b in merged)
    return evidence, f"merged:{window_label}"

def classify_question(question: str) -> str:
    q = question.lower()
    intent = CATEGORIES["GENERAL"]

    if any(x in q for x in ["summarize", "recap", "full story", "whole game", "what happened", "story of the game"]):
        intent = CATEGORIES["GAME_SUMMARY"]

    elif any(x in q for x in [
        "winning", "win this", "convert", "conversion", "endgame", "finish", "winning plan",
        "final phase", "how to win", "why is this winning", "how did white win", "how did black win",
        "how white won", "how black won", "won the game", "win the game", "who converted",
    ]):
        if any(x in q for x in ["endgame", "final phase"]):
            intent = CATEGORIES["ENDGAME_ANALYSIS"]
        else:
            intent = CATEGORIES["WINNING_CONVERSION_ANALYSIS"]

    elif any(x in q for x in ["result", "who won", "winner", "score"]):
        intent = CATEGORIES["RESULT_EXPLANATION"]

    elif any(x in q for x in ["opening", "theory", "start of the game", "first moves"]):
        intent = CATEGORIES["OPENING_ANALYSIS"]

    elif any(x in q for x in [
        "mistake", "blunder", "tactic", "mate", "checkmate", "turning point", "improve", "better move",
        "key mistake", "wrong move", "error", "inaccuracy",
    ]):
        intent = CATEGORIES["TACTIC_ANALYSIS"]

    elif any(x in q for x in ["move", "play", "position", "situation", "board state", "castle", "castling"]) or any(
        char.isdigit() for char in q
    ):
        intent = CATEGORIES["MOVE_EXPLANATION"]

    return intent

CATEGORY_RETRIEVAL_HINTS = {
    CATEGORIES["GAME_SUMMARY"]: (
        "Full-game story from merged 10–15 half-move windows around key moments (captures, checks, mates, promotions). "
        "Do not narrate the whole game move-by-move unless evidence includes it."
    ),
    CATEGORIES["WINNING_CONVERSION_ANALYSIS"]: (
        "Final phase: how the winner converted — last ~15 half-moves, checks/captures in the late fight, mate or result evidence, "
        "and FEN-backed description of the decisive turns."
    ),
    CATEGORIES["ENDGAME_ANALYSIS"]: (
        "Endgame: last ~25 half-moves; king activity, material, pawns, passed pawns, promotion threats — grounded in FENs in evidence."
    ),
    CATEGORIES["RESULT_EXPLANATION"]: (
        "Result: outcome line plus last ~12 half-moves and any mate in the evidence; do not claim mate without evidence."
    ),
    CATEGORIES["OPENING_ANALYSIS"]: (
        "Opening: first ~8–15 half-moves only; name or describe the opening only from those moves (plus metadata if present)."
    ),
    CATEGORIES["TACTIC_ANALYSIS"]: (
        "Mistake/tactic: ~12 half-moves before and after the referenced or inferred key moment; show before/after consequences in the game."
    ),
    CATEGORIES["MOVE_EXPLANATION"]: (
        "Move/position: tight window (~12 before/after) around the cited half-move or selected move; tie claims to those blocks and FENs."
    ),
    CATEGORIES["GENERAL"]: (
        "General: use the lightweight scan (opening + recent segment) or digit-focused window; still evidence-first."
    ),
}


def retrieve_analyst_evidence(
    category: str,
    question: str,
    ai_text_format: Optional[str],
    selected_move: Optional[str] = None,
    pgn: Optional[str] = None,
    client_fen: Optional[str] = None,
) -> AnalystRetrievalResult:
    lines = (ai_text_format or "").replace("\r\n", "\n").split("\n")
    move_blocks = extract_halfmove_evidence_blocks(ai_text_format or "")
    total = len(move_blocks)
    result_line = result_lines_from_ai_text(lines)
    q = question.lower()

    prefix: List[str] = []
    if client_fen and client_fen.strip():
        prefix.append(f"Client-reported board FEN: {client_fen.strip()}")
    meta_lines = extract_metadata_prefix_lines(ai_text_format or "")
    if meta_lines:
        prefix.append("Game metadata (from AI text):\n" + "\n".join(meta_lines))

    move_evidence: List[str] = []
    strategy = "unknown"
    window_label = "n/a"

    if total == 0:
        strategy = "pgn_and_metadata_fallback_no_halfmove_blocks"
        if pgn and pgn.strip():
            move_evidence.append(
                "PGN (use as primary move sequence; half-move+FEN blocks unavailable):\n" + pgn.strip()[:4500]
            )
        move_evidence.extend(result_line)
        if not move_evidence:
            move_evidence.append(
                "No game text available: state that you cannot retrieve this game."
            )
        combined = prefix + move_evidence
        deduped = list(dict.fromkeys(combined))
        return AnalystRetrievalResult(
            evidence=deduped,
            strategy=strategy,
            window_label="n/a",
            fen_in_evidence=count_fens_in_evidence(deduped),
            category=category,
        )

    if category == CATEGORIES["GAME_SUMMARY"]:
        strategy = "merged_key_moment_windows_radius_12_plus_result"
        se, window_label = get_summary_evidence(move_blocks, radius=12)
        move_evidence.extend(se)
        move_evidence.extend(result_line)

    elif category == CATEGORIES["WINNING_CONVERSION_ANALYSIS"]:
        strategy = "final_15_halfmoves_late_tactical_captures_checks_mate_result"
        tail = 15
        move_evidence.extend(move_blocks[-tail:])
        for i in range(max(0, total - 20), total):
            b = move_blocks[i]
            san = san_from_halfmove_block(b)
            if any(c in san for c in ["x", "+", "#"]):
                move_evidence.append(b)
        mate_blocks = [b for b in move_blocks if "#" in san_from_halfmove_block(b)]
        move_evidence.extend(mate_blocks)
        move_evidence.extend(result_line)
        window_label = f"{max(1, total - tail + 1)}-{total}"

    elif category == CATEGORIES["ENDGAME_ANALYSIS"]:
        strategy = "final_25_halfmoves_plus_result"
        tail = 25
        move_evidence.extend(move_blocks[-tail:])
        move_evidence.extend(result_line)
        window_label = f"{max(1, total - tail + 1)}-{total}"

    elif category == CATEGORIES["RESULT_EXPLANATION"]:
        strategy = "last_12_halfmoves_any_mate_blocks_result"
        take = min(12, total)
        move_evidence.extend(move_blocks[-take:])
        mate_blocks = [b for b in move_blocks if "#" in san_from_halfmove_block(b)]
        move_evidence.extend(mate_blocks)
        move_evidence.extend(result_line)
        window_label = f"{max(1, total - take + 1)}-{total}"

    elif category == CATEGORIES["OPENING_ANALYSIS"]:
        strategy = "first_15_halfmoves_plus_result"
        take = min(15, total)
        move_evidence.extend(move_blocks[:take])
        move_evidence.extend(result_line)
        window_label = f"1-{take}"

    elif category == CATEGORIES["TACTIC_ANALYSIS"]:
        strategy = "tactical_window_12_12_or_last_key_moment"
        move_match = re.search(r"(\d+)", q)
        placed = False
        if move_match:
            idx = int(move_match.group(1)) - 1
            if 0 <= idx < total:
                ev, ws, we = halfmove_window(move_blocks, idx, 12, 12)
                move_evidence.extend(ev)
                window_label = f"{ws}-{we}"
                placed = True
        if not placed:
            keys = get_key_move_indices(move_blocks)
            center = keys[-1] if keys else total - 1
            ev, ws, we = halfmove_window(move_blocks, center, 12, 12)
            move_evidence.extend(ev)
            window_label = f"{ws}-{we}"
        move_evidence.extend(result_line)

    elif category == CATEGORIES["MOVE_EXPLANATION"]:
        strategy = "move_window_12_12_fallback_endgame"
        move_match = re.search(r"(\d+)", q)
        placed = False
        if move_match:
            idx = int(move_match.group(1)) - 1
            if 0 <= idx < total:
                ev, ws, we = halfmove_window(move_blocks, idx, 12, 12)
                move_evidence.extend(ev)
                window_label = f"{ws}-{we}"
                placed = True
        if not placed and selected_move:
            for i, block in enumerate(move_blocks):
                if selected_move in block:
                    ev, ws, we = halfmove_window(move_blocks, i, 12, 12)
                    move_evidence.extend(ev)
                    window_label = f"{ws}-{we}"
                    placed = True
                    break
        if not placed:
            ev, ws, we = halfmove_window(move_blocks, total - 1, 12, 12)
            move_evidence.extend(ev)
            window_label = f"{ws}-{we}"
        move_evidence.extend(result_line)

    else:
        strategy = "general_digit_window_or_head_tail_scan"
        move_match = re.search(r"(\d+)", q)
        if move_match:
            idx = int(move_match.group(1)) - 1
            if 0 <= idx < total:
                ev, ws, we = halfmove_window(move_blocks, idx, 12, 12)
                move_evidence.extend(ev)
                window_label = f"{ws}-{we}"
        if not move_evidence:
            head_n = min(5, total)
            tail_n = min(12, total)
            move_evidence.append("Opening segment (first half-moves):")
            move_evidence.extend(move_blocks[:head_n])
            move_evidence.append("...")
            move_evidence.append("Recent segment (last half-moves):")
            move_evidence.extend(move_blocks[-tail_n:])
            window_label = f"1-{head_n} and {max(1, total - tail_n + 1)}-{total}"
        move_evidence.extend(result_line)

    combined = prefix + move_evidence
    deduped = list(dict.fromkeys(combined))
    return AnalystRetrievalResult(
        evidence=deduped,
        strategy=strategy,
        window_label=window_label,
        fen_in_evidence=count_fens_in_evidence(deduped),
        category=category,
    )

@app.post("/api/chat")
def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    category = classify_question(req.message)
    retrieval = retrieve_analyst_evidence(
        category,
        req.message,
        req.aiTextFormat,
        req.selectedMove,
        req.pgn,
        req.fen,
    )

    evidence_trimmed = trim_evidence_to_budget(retrieval.evidence, MAX_PROMPT_CHARS)
    evidence_str = format_evidence_for_prompt(evidence_trimmed)
    cat_hint = CATEGORY_RETRIEVAL_HINTS.get(category, CATEGORY_RETRIEVAL_HINTS[CATEGORIES["GENERAL"]])

    raw_pgn = (req.pgn or "").strip()
    pgn_excerpt = raw_pgn[:2800]
    if len(raw_pgn) > 2800:
        pgn_excerpt += "\n[... PGN truncated ...]"

    prompt = f"""{ANALYST_RAG_MINDSET}

{ANALYST_FEN_INSTRUCTIONS}

RETRIEVAL CONTEXT FOR THIS TURN:
- Classified category: {category}
- Retrieval strategy applied: {retrieval.strategy}
- Category focus: {cat_hint}

CROSS-CHECK — full PGN movetext (support facts only when consistent with retrieved evidence blocks):
{pgn_excerpt if pgn_excerpt else "Not provided"}

UI-selected move hint: {req.selectedMove or "Not provided"}

EVIDENCE RETRIEVED FOR THIS QUESTION (primary source — cite these blocks and their FENs):
{evidence_str}

USER QUESTION:
{req.message}
"""

    # Include proficiency level if provided
    if req.proficiencyLevel:
        level_rules = {
            'beginner': 'Beginner level: Use simple language, keep answers short, explain chess terms when used, avoid deep move lines.',
            'intermediate': 'Intermediate level: Include plans, common ideas, some notation, and practical advice.',
            'advanced': 'Advanced level: Include theory, variations, strategic detail, precise chess language, and deep analysis.'
        }
        rule = level_rules.get(req.proficiencyLevel, level_rules['intermediate'])
        prompt += f"\n\nUser chess proficiency level: {req.proficiencyLevel}\n{rule}\n"

    timeout_val = 90

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.8
        }
    }

    preview = (evidence_str[:220] + "…") if len(evidence_str) > 220 else evidence_str
    preview = preview.replace("\n", " ")
    n_items = len(evidence_trimmed)
    fen_n = count_fens_in_evidence(evidence_trimmed)
    grounded = bool(evidence_trimmed) and evidence_str.strip() != "None provided."

    log_event(
        "info",
        "analyst.retrieval.completed",
        category=category,
        strategy=retrieval.strategy,
        evidenceCount=n_items,
        moveWindow=retrieval.window_label,
        fenCount=fen_n,
        grounded=grounded,
    )

    start_time = time.time()
    log_event(
        "info",
        "analyst.inference.started",
        category=category,
        evidenceCount=n_items,
        promptChars=len(prompt),
        selectedMoveProvided=bool(req.selectedMove),
        gameId=req.gameId,
    )

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=timeout_val)
        elapsed = time.time() - start_time
        log_event("info", "analyst.inference.completed", latencyMs=round(elapsed * 1000, 2))

        if response.status_code == 404:
            return {"error": f"Model not found. Install it with: ollama pull {OLLAMA_MODEL}"}

        response.raise_for_status()
        data = response.json()
        return {"reply": data.get("response", "No response from model.")}

    except requests.exceptions.ConnectionError:
        return {"error": "Ollama is not running. Start it with: ollama serve"}
    except requests.exceptions.Timeout:
        elapsed = time.time() - start_time
        log_event("warn", "analyst.inference.timeout", latencyMs=round(elapsed * 1000, 2))
        return {"error": "Ollama took too long to respond. Try a shorter PGN context or restart Ollama."}
    except Exception as error:
        log_event("error", "analyst.inference.failed", errorType=type(error).__name__)
        return {"error": "The analysis service could not complete the request."}

@app.get("/api/ollama-health")
def ollama_health():
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/", timeout=5)
        if response.status_code == 200:
            return {"status": "ok", "message": "Ollama is reachable"}
        return {"status": "error", "message": "Ollama returned non-200"}
    except Exception as error:
        log_event("warn", "ollama.health.unavailable", errorType=type(error).__name__)
        return {"status": "error", "message": "Ollama is unavailable"}

class CoachRequest(BaseModel):
    message: str
    proficiencyLevel: Optional[str] = None

@app.post("/api/coach")
def coach_chat(req: CoachRequest):
    global coach_engine
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    
    start_time = time.time()
    log_event("info", "coach.query.started", proficiencyLevel=req.proficiencyLevel)
    
    try:
        if coach_engine is None:
            log_event("info", "coach.engine.initialization.started")
            coach_engine = CoachRAGEngine()
            
        reply = coach_engine.query(req.message, proficiency_level=req.proficiencyLevel)
        elapsed = time.time() - start_time
        log_event("info", "coach.query.completed", latencyMs=round(elapsed * 1000, 2))
        return reply
    except Exception as error:
        log_event("error", "coach.query.failed", errorType=type(error).__name__)
        return {"error": "The coaching service could not complete the request."}

# Ensure static directory exists
os.makedirs("static", exist_ok=True)

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve static assets and let the client router handle app routes."""
    static_root = os.path.abspath("static")
    requested_path = os.path.abspath(os.path.join(static_root, full_path))

    if os.path.commonpath([static_root, requested_path]) == static_root and os.path.isfile(requested_path):
        return FileResponse(requested_path)

    return FileResponse(os.path.join(static_root, "index.html"))

if __name__ == "__main__":
    print("\n--- Chess App Startup ---")
    print(f"Working Directory: {os.getcwd()}")
    print(f"Knowledge Base Directory: {os.path.abspath('knowledge_base')}")
    print(f"Vector Store Path: {os.path.abspath('coach_vector_store.json')}")
    
    # Check if vector store exists
    if os.path.exists('coach_vector_store.json'):
        size = os.path.getsize('coach_vector_store.json')
        print(f"Vector Store exists ({size} bytes).")
    else:
        print("Vector Store NOT found. Will be created on first coach query.")

    print("Starting Chess App on http://localhost:8001")
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8001")),
        reload=os.getenv("RELOAD", "true").lower() in {"1", "true", "yes"},
    )
