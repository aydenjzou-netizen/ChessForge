import os
import glob
import json
import math
import urllib.request
import urllib.parse
import csv
import threading
import re
import difflib

OLLAMA_URL = "http://localhost:11434"

def post_json(url, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"HTTP Error posting to {url}: {e}")
        return {}

def get_embedding(text):
    resp = post_json(f"{OLLAMA_URL}/api/embeddings", {
        "model": "nomic-embed-text",
        "prompt": text
    })
    return resp.get('embedding', [])

def cosine_similarity(a, b):
    if not a or not b or len(a) != len(b): return 0.0
    dot = sum(x*y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x*x for x in a))
    norm_b = math.sqrt(sum(x*x for x in b))
    if norm_a == 0 or norm_b == 0: return 0.0
    return dot / (norm_a * norm_b)

def get_category_from_source(source):
    s = source.lower()
    if 'opening' in s: return 'opening'
    if 'tactic' in s: return 'tactic'
    if 'endgame' in s: return 'endgame'
    return 'general'

def normalize_text(text):
    if not text: return ""
    t = text.lower()
    # Normalize apostrophes: King's -> kings
    t = t.replace("'s", "s").replace("’s", "s")
    # Normalize hyphens and punctuation to spaces
    t = re.sub(r'[-/\\:;,.?!]', ' ', t)
    # Remove extra spaces
    t = " ".join(t.split())
    return t

def extract_opening_aliases(name):
    """
    Generates variations of an opening name for better matching.
    Example: 'Catalan Opening: Closed' -> ['catalan opening closed', 'catalan opening', 'catalan', 'closed']
    """
    if not name or name == "Unknown": return []
    
    full_norm = normalize_text(name)
    aliases = {full_norm}
    
    # Split by colon, dash, or parentheses
    parts = re.split(r'[:\-\(\)]', name)
    for p in parts:
        p_norm = normalize_text(p)
        if p_norm and len(p_norm) > 2:
            aliases.add(p_norm)
            
            # Split into individual significant words
            words = p_norm.split()
            if len(words) > 1:
                for w in words:
                    # Ignore very short words or generic chess terms as standalone aliases
                    if len(w) > 3 and w not in ["opening", "defense", "defence", "gambit", "system", "game", "attack", "variation", "line"]:
                        aliases.add(w)
            
            # Special case for Indian defenses: "King's Indian Defense" -> "King Indian"
            if "indian" in p_norm:
                aliases.add(p_norm.replace("kings", "king").replace("queens", "queen"))
                
    return list(aliases)

def get_keyword_signals(message, opening_vocabulary=None):
    msg_raw = message.lower()
    msg_norm = normalize_text(message)
    
    # General intent keywords (no hardcoded opening names here)
    opening_keywords = [
        'opening', 'defense', 'defence', 'gambit', 'variation', 'line', 'system', 'trap', 
        'repertoire', 'main line', 'theory'
    ]
    
    # Tactic keywords
    tactic_keywords = [
        'tactic', 'tactics', 'fork', 'pin', 'skewer', 'discovered attack', 'discovered check', 
        'double attack', 'deflection', 'decoy', 'sacrifice', 'mate', 'checkmate pattern', 
        'back rank', 'clearance', 'interference', 'zwischenzug', 'x-ray'
    ]
    
    # Endgame keywords
    endgame_keywords = [
        'endgame', 'king and pawn', 'opposition', 'triangulation', 'zugzwang', 'rook endgame', 
        'queen endgame', 'bishop endgame', 'knight endgame', 'passed pawn', 'promotion', 
        'lucena', 'philidor', 'checkmate with king', 'king and queen mate', 'king and rook mate'
    ]
    
    # move notation patterns
    move_pattern = re.compile(r'\b([1-9][0-9]*\.\s*[a-h][1-8]|[a-h][1-8]\s*[a-h][1-8]|N[a-h][1-8]|B[a-h][1-8]|R[a-h][1-8]|Q[a-h][1-8]|K[a-h][1-8])\b')
    
    opening_score = 0
    matched_opening = None

    # 1. Dynamic Opening Vocabulary Matching
    if opening_vocabulary:
        # Sort by length to match most specific phrases first
        sorted_vocab = sorted(list(opening_vocabulary), key=len, reverse=True)
        
        # Substring match (normalized)
        for alias in sorted_vocab:
            if len(alias) < 4: continue # Skip very short aliases for substring match
            if alias in msg_norm:
                opening_score += 4
                matched_opening = alias
                break
        
        # Token-based fuzzy match if no substring match
        if not matched_opening:
            tokens = msg_norm.split()
            for token in tokens:
                if len(token) > 4:
                    # Limit search space for performance: only check vocabulary entries starting with same letter? 
                    # No, let's try a small set of close matches.
                    matches = difflib.get_close_matches(token, opening_vocabulary, n=1, cutoff=0.85)
                    if matches:
                        opening_score += 3
                        matched_opening = matches[0]
                        break

    # 2. Intent Keywords
    opening_score += sum(1 for kw in opening_keywords if kw in msg_raw)
    
    # 3. Move notation
    if move_pattern.search(message):
        opening_score += 5
        
    tactic_score = sum(1 for kw in tactic_keywords if kw in msg_raw)
    endgame_score = sum(1 for kw in endgame_keywords if kw in msg_raw)

    # Secondary intent detection (e.g. "tactics in the Sicilian")
    if "tactic" in msg_raw and matched_opening:
        tactic_score += 2
        
    return {
        "opening": opening_score,
        "tactic": tactic_score,
        "endgame": endgame_score,
        "matchedOpening": matched_opening
    }


class CoachRAGEngine:
    def __init__(self):
        # Use absolute paths to prevent directory relative bugs
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.doc_dir = os.path.join(self.base_dir, "knowledge_base")
        self.persist_file = os.path.join(self.base_dir, "coach_vector_store.json")
        
        self.chunks = []
        self.file_mtimes = {}
        self.is_indexing = False
        self.status = "not_built" # States: not_built, loading, indexing, ready, error
        
        self.opening_vocabulary = set() # Dynamic list of opening names/aliases
        self.opening_count = 0
        
        print(f"CoachRAGEngine Initializing:")
        print(f"  - Project Root: {self.base_dir}")
        print(f"  - Database Dir: {self.doc_dir}")
        print(f"  - Vector Store: {self.persist_file}")
        
        self.load_index()

    def load_index(self):
        self.status = "loading"
        if os.path.exists(self.persist_file):
            try:
                with open(self.persist_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.file_mtimes = data.get("file_mtimes", {})
                    self.chunks = data.get("chunks", [])
                
                if len(self.chunks) > 0:
                    self.status = "ready"
                    print(f"CoachRAGEngine: Loaded existing index with {len(self.chunks)} chunks.")
                    
                    # Build vocabulary from chunks
                    for c in self.chunks:
                        if get_category_from_source(c['source']) == 'opening':
                            var_data = self.extract_variation_data(c)
                            self.opening_vocabulary.update(extract_opening_aliases(var_data['name']))
                            self.opening_vocabulary.update(extract_opening_aliases(var_data['family']))
                    self.opening_count = len(self.opening_vocabulary)
                    print(f"CoachRAGEngine: Dynamic opening vocabulary loaded: {self.opening_count} entries.")
                else:
                    self.status = "not_built"
                    print("CoachRAGEngine: Index file found but contains 0 chunks.")
            except Exception as e:
                self.status = "error"
                print(f"CoachRAGEngine: Failed to load index: {e}")
        else:
            self.status = "not_built"
            print("CoachRAGEngine: No vector index file found on disk.")

    def check_needs_sync(self):
        if not os.path.exists(self.doc_dir):
            print(f"CoachRAGEngine: Knowledge base directory {self.doc_dir} missing.")
            return False, [], [], {}
            
        files = []
        files.extend(glob.glob(os.path.join(self.doc_dir, "**/*.md"), recursive=True))
        files.extend(glob.glob(os.path.join(self.doc_dir, "**/*.csv"), recursive=True))
        
        current_mtimes = {}
        changed_files = []
        
        for f in files:
            mtime = os.path.getmtime(f)
            current_mtimes[f] = mtime
            if f not in self.file_mtimes or self.file_mtimes[f] != mtime:
                changed_files.append(f)
                
        deleted_files = [f for f in self.file_mtimes if f not in current_mtimes]
        
        # CRITICAL FIX: If chunks is empty but files exist, we NEED a sync
        if not self.chunks and (changed_files or files):
            print("CoachRAGEngine: Index is empty but source files exist. Forcing sync.")
            if not changed_files: changed_files = files
            return True, changed_files, deleted_files, current_mtimes

        needs_sync = bool(changed_files or deleted_files)
        return needs_sync, changed_files, deleted_files, current_mtimes

    def chunk_text(self, text, chunk_size=1000, chunk_overlap=150):
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunks.append(text[start:end])
            if end >= len(text): break
            start += chunk_size - chunk_overlap
        return chunks

    def sync_index(self, changed_files, deleted_files, current_mtimes, chunk_size=1000, chunk_overlap=150):
        self.status = "indexing"
        self.is_indexing = True
        print(f"CoachRAGEngine: Syncing index in background. {len(changed_files)} changed, {len(deleted_files)} deleted.")
        
        sources_to_remove = set([os.path.basename(f) for f in deleted_files + changed_files])
        if sources_to_remove:
            self.chunks = [c for c in self.chunks if c["source"] not in sources_to_remove]
            
        chunk_id = len(self.chunks)
        for f in changed_files:
            source = os.path.basename(f)
            if f.endswith('.csv'):
                with open(f, 'r', encoding='utf-8') as file:
                    reader = csv.DictReader(file)
                    for row in reader:
                        name = row.get('name', 'Unknown')
                        eco = row.get('eco', '')
                        pgn = row.get('pgn', '')
                        epd = row.get('epd', '')
                        
                        if ':' in name:
                            family = name.split(':')[0].strip()
                            variation = name.split(':', 1)[1].strip()
                        else:
                            family = name
                            variation = "None"
                            
                        piece = f"Opening Name: {name}\nFamily: {family}\nVariation: {variation}\nECO: {eco}\nMoves: {pgn}\nFEN/EPD: {epd}"
                        
                        # Add to dynamic vocabulary
                        self.opening_vocabulary.update(extract_opening_aliases(name))
                        self.opening_vocabulary.update(extract_opening_aliases(family))
                        
                        emb = get_embedding(piece)
                        if emb:
                            self.chunks.append({
                                "id": f"chunk_{chunk_id}",
                                "source": source,
                                "content": piece,
                                "vector": emb
                            })
                            chunk_id += 1
            else:
                with open(f, 'r', encoding='utf-8') as file:
                    text = file.read()
                    pieces = self.chunk_text(text, chunk_size, chunk_overlap)
                    for piece in pieces:
                        emb = get_embedding(piece)
                        if emb:
                            self.chunks.append({
                                "id": f"chunk_{chunk_id}",
                                "source": source,
                                "content": piece,
                                "vector": emb
                            })
                            chunk_id += 1

        self.file_mtimes = current_mtimes
        
        try:
            with open(self.persist_file, 'w', encoding='utf-8') as f:
                json.dump({
                    "file_mtimes": self.file_mtimes,
                    "chunks": self.chunks
                }, f)
            print(f"CoachRAGEngine: Index saved to {self.persist_file}. Document count: {len(self.chunks)}")
        except Exception as e:
            print(f"CoachRAGEngine: Failed to save index: {e}")
            
        print(f"CoachRAGEngine: Index synced. Total chunks: {len(self.chunks)}")
        self.is_indexing = False
        self.status = "ready" if len(self.chunks) > 0 else "not_built"

    def retrieve_evidence(self, question, top_k=10):
        q_emb = get_embedding(question)
        if not q_emb:
            return []

        q_lower = question.lower()
        # Extract potential opening name tokens
        tokens = [t for t in q_lower.split() if len(t) > 3]

        evidence = []
        for c in self.chunks:
            score = cosine_similarity(q_emb, c['vector'])
            cat = get_category_from_source(c['source'])
            
            # Extract structured data
            var_data = self.extract_variation_data(c)
            
            # Lexical Boost
            boost = 0.0
            name_lower = var_data['name'].lower()
            family_lower = var_data['family'].lower()
            
            # 1. Exact match boost (High)
            # FIX: Reverse the check. Usually opening name is shorter than the question.
            if name_lower in q_lower or family_lower in q_lower:
                boost += 0.3
            else:
                # 2. Token match boost (Medium)
                for t in tokens:
                    if t in name_lower or t in family_lower:
                        boost += 0.05
            
            final_score = score + boost
            
            # Map relevance based on final score
            # ALIGNED: Using 0.50 as medium threshold to match route_query
            relevance = "weak"
            if final_score >= 0.75: relevance = "strong"
            elif final_score >= 0.50: relevance = "medium"
            
            # Log every chunk retrieved (for focused debugging)
            if final_score >= 0.4:
                print(f"[OpeningLinesDebug] Raw chunk retrieved: {c['id']} - {var_data['name']} / {var_data['variation']} - Score: {final_score:.4f} (Base: {score:.4f}, Boost: {boost:.4f})")
            
            evidence.append({
                "sourceId": c['id'],
                "content": c['content'],
                "category": cat,
                "score": round(final_score, 4),
                "baseScore": round(score, 4),
                "relevance": relevance,
                "openingName": var_data['name'],
                "variationName": var_data['variation'],
                "moves": var_data['moves'],
                "eco": var_data['eco'],
                "family": var_data['family'],
                "usedInAnswer": False,
                "retrievalReason": f"Similarity: {score:.3f}, Boost: {boost:.3f}"
            })

        # Sort by final score
        evidence.sort(key=lambda x: x['score'], reverse=True)
        return evidence[:top_k]

    def route_query(self, question, evidence=None):
        # 0. Check vocabulary status
        if not self.opening_vocabulary:
             print("[ChessCoachRouter] WARNING: Dynamic opening vocabulary unavailable. Falling back to retrieval and general intent keywords.")

        # 1. Keyword Signals
        kw_signals = get_keyword_signals(question, self.opening_vocabulary)
        matched_name = kw_signals.get("matchedOpening")
        
        # 2. Retrieval Signals (from pre-retrieved evidence)
        if evidence is None:
            evidence = self.retrieve_evidence(question)
        
        # Check availability
        available_files = os.listdir(self.doc_dir) if os.path.exists(self.doc_dir) else []
        availability = {
            "opening": any("opening" in f.lower() for f in available_files),
            "tactic": any("tactic" in f.lower() for f in available_files),
            "endgame": any("endgame" in f.lower() for f in available_files)
        }

        scores = {"opening": 0.0, "tactic": 0.0, "endgame": 0.0}
        top_matches = {"opening": [], "tactic": [], "endgame": []}

        for ev in evidence:
            cat = ev['category']
            if cat in scores and ev['score'] > scores[cat]:
                scores[cat] = ev['score']
                top_matches[cat] = [ev['openingName'] if cat == 'opening' else ev['content'][:50]]

        # Thresholds
        STRONG_THRESH = 0.75
        MEDIUM_THRESH = 0.50
        MIN_RETRIEVAL_THRESH = 0.65
        
        sorted_ret = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_cat, top_score = sorted_ret[0]

        primary = "general"
        secondary = None
        confidence = 0.5
        reason = ""

        kw_winner = "opening" if kw_signals["opening"] > kw_signals["tactic"] and kw_signals["opening"] > kw_signals["endgame"] else ("tactic" if kw_signals["tactic"] > kw_signals["endgame"] else "endgame")
        if kw_signals["opening"] == 0 and kw_signals["tactic"] == 0 and kw_signals["endgame"] == 0:
            kw_winner = "general"

        if top_score >= STRONG_THRESH:
            primary = top_cat
            confidence = top_score
            reason = f"{top_cat.title()} knowledgebase had a very strong match ({top_score:.2f})."
        elif matched_name:
            primary = "opening"
            confidence = 0.9
            reason = f"Exact or fuzzy match for opening name '{matched_name}' found in vocabulary."
        elif top_score >= MEDIUM_THRESH and kw_winner == top_cat:
            primary = top_cat
            confidence = min(top_score + 0.1, 0.95)
            reason = f"Keyword rules and retrieval both suggest {top_cat}."
        elif kw_winner != "general" and (kw_winner != top_cat or top_score < 0.65):
            primary = kw_winner
            confidence = 0.8
            reason = f"User intent keyword '{kw_winner}' prioritized over weak retrieval."
            if top_score >= MEDIUM_THRESH and top_cat != primary:
                secondary = top_cat
        elif top_score >= MIN_RETRIEVAL_THRESH:
            primary = top_cat
            confidence = top_score
            reason = f"{top_cat.title()} knowledgebase had the strongest match."
        elif kw_winner != "general":
            primary = kw_winner
            confidence = 0.6
            reason = "Retrieval scores were weak, falling back to keyword rules."
        else:
            primary = "general"
            confidence = 0.5
            reason = "Both retrieval and keyword rules were weak."

        # ChessCoachRouter Logging
        print(f"[ChessCoachRouter] User query: {question}")
        print(f"[ChessCoachRouter] Dynamic opening vocabulary loaded: {self.opening_count}")
        print(f"[ChessCoachRouter] Opening name match: {matched_name or 'None'}")
        print(f"[ChessCoachRouter] Opening match score: {kw_signals['opening']}")
        print(f"[ChessCoachRouter] Opening retrieval top result: {top_matches['opening'][0] if top_matches['opening'] else 'None'}")
        print(f"[ChessCoachRouter] Final classification: {primary}")
        print(f"[ChessCoachRouter] Reason: {reason}")

        return {
            "primaryType": primary,
            "secondaryType": secondary,
            "confidence": round(min(confidence, 0.99), 2),
            "reason": reason,
            "retrievalScores": scores,
            "topMatches": top_matches,
            "availability": availability
        }

    def extract_variation_data(self, chunk):
        content = chunk['content']
        data = {
            "name": "Unknown",
            "family": "",
            "variation": "",
            "eco": "",
            "moves": "",
            "description": "",
            "sourceId": chunk.get('id', '')
        }
        
        lines = content.split('\n')
        for line in lines:
            if line.startswith('Opening Name:'): data['name'] = line.replace('Opening Name:', '').strip()
            elif line.startswith('Family:'): data['family'] = line.replace('Family:', '').strip()
            elif line.startswith('Variation:'): data['variation'] = line.replace('Variation:', '').strip()
            elif line.startswith('ECO:'): data['eco'] = line.replace('ECO:', '').strip()
            elif line.startswith('Moves:'): data['moves'] = line.replace('Moves:', '').strip()
            elif line.startswith('FEN/EPD:'): data['fen'] = line.replace('FEN/EPD:', '').strip()

        # Simple description if nothing else
        data['description'] = f"Part of the {data['family']} family." if data['family'] else ""
        
        return data

    def group_opening_lines(self, evidence):
        # opening_map = { openingName: { groupTitle: { groupType, lines } } }
        opening_map = {}
        seen = set()
        
        main_line_count = 0
        named_var_count = 0

        for ev in evidence:
            if ev['category'] != 'opening' or not ev['moves']:
                continue
            
            o_name = ev['openingName']
            v_name = ev['variationName']
            moves = ev['moves'].strip()
            
            # Deduplication: openingName + variationName + normalizedMoves
            key = (o_name.lower(), v_name.lower() if v_name else "", moves)
            if key in seen:
                continue
            seen.add(key)
            
            # Determine line type and group title
            is_main = v_name in ["None", "", None] or v_name.lower() == o_name.lower() or "main line" in v_name.lower()
            line_type = "main_line" if is_main else "named_variation"
            
            group_title = "Main Line" if is_main else v_name
            
            if o_name not in opening_map:
                opening_map[o_name] = {}
            
            if group_title not in opening_map[o_name]:
                opening_map[o_name][group_title] = {
                    "groupType": line_type,
                    "groupTitle": group_title,
                    "lines": []
                }
            
            display_title = o_name if is_main else f"{v_name}"
            if is_main and "main line" not in display_title.lower(): 
                display_title += " Main Line"
            
            opening_map[o_name][group_title]["lines"].append({
                "displayTitle": display_title,
                "openingName": o_name,
                "variationName": v_name,
                "lineType": line_type,
                "moves": moves,
                "eco": ev['eco'],
                "sourceId": ev['sourceId'],
                "score": ev['score'],
                "usedInAnswer": ev.get('usedInAnswer', False)
            })
            
            if line_type == "main_line": main_line_count += 1
            else: named_var_count += 1

        # Convert map to requested list structure
        result = []
        for o_name, groups_map in opening_map.items():
            # Sort groups: main_line first
            groups_list = list(groups_map.values())
            groups_list.sort(key=lambda g: 0 if g['groupType'] == 'main_line' else 1)
            
            result.append({
                "openingName": o_name,
                "groups": groups_list
            })
            
        # Logging
        print(f"[OpeningLinesDebug] openingLines built count: {len(result)}")
        if result:
            print(f"[OpeningLinesDebug] openingLines sample: {result[0]['openingName']} with {len(result[0]['groups'])} groups")
        
        return result

    def query(self, question: str, top_k: int = 8, proficiency_level: str = None):
        if self.status == "indexing" or self.is_indexing:
            return {"answer": "Preparing Chess Coach database... This will take a few minutes.", "classification": {"primaryType": "status"}}
            
        if self.status == "not_built":
            return {"answer": "Chess Coach database is not built yet.", "classification": {"primaryType": "status"}}

        # 1. Unified Retrieval
        all_evidence = self.retrieve_evidence(question, top_k=15)
        
        # 2. Routing
        route = self.route_query(question, all_evidence)
        p_type = route["primaryType"]
        s_type = route["secondaryType"]
        
        print(f"\n[ChessCoach] User query: {question}")
        print(f"[ChessCoach] Final classification: {p_type}")
        print(f"[ChessCoachRetrieval] Retrieved candidates: {len(all_evidence)}")

        if p_type == 'general':
            level_instruction = ''
            if proficiency_level:
                level_rules = {'beginner': 'Use simple language, short answers, explain chess terms.', 'intermediate': 'Include plans, common ideas, some notation.', 'advanced': 'Include theory, variations, strategic detail, precise chess language.'}
                level_instruction = f'\nUser proficiency: {proficiency_level}. {level_rules.get(proficiency_level, level_rules["intermediate"])}'
            prompt = f"You are a friendly Chess Coach.{level_instruction} Answer: {question}\nAnswer:"
            resp = post_json(f"{OLLAMA_URL}/api/generate", {"model": "phi3:mini", "prompt": prompt, "stream": False})
            return {
                "classification": route,
                "answer": resp.get("response", "I'm sorry, I couldn't generate a response.").strip(),
                "evidenceUsed": [],
                "openingLines": []
            }

        # 3. Filter Evidence for Answer
        # Primary category: Only Strong and Medium matches
        primary_evidence = [ev for ev in all_evidence if ev['category'] == p_type and ev['relevance'] in ['strong', 'medium']]
        
        # Optional secondary category context
        secondary_evidence = []
        if s_type:
            secondary_evidence = [ev for ev in all_evidence if ev['category'] == s_type and ev['relevance'] in ['strong', 'medium']]
        
        final_evidence = (primary_evidence[:top_k] + secondary_evidence[:2])
        
        # Mark used
        for ev in final_evidence:
            ev['usedInAnswer'] = True

        print(f"[ChessCoachRetrieval] Final evidence used: {len(final_evidence)}")
        print(f"[ChessCoachRetrieval] Evidence used titles: {[e['openingName'] for e in final_evidence]}")

        if not final_evidence:
            prompt = f"You are a friendly Chess Coach. I couldn't find specific entries for {p_type}, but I can answer generally: {question}\nAnswer:"
            resp = post_json(f"{OLLAMA_URL}/api/generate", {"model": "phi3:mini", "prompt": prompt, "stream": False})
            return {
                "classification": route,
                "answer": resp.get("response", "I couldn't find specific data, but I can answer generally.").strip(),
                "evidenceUsed": [],
                "openingLines": []
            }

        # 4. Answer Generation
        context_text = "\n\n".join([f"Source: {ev['sourceId']}\n{ev['content']}" for ev in final_evidence])
        
        level_instruction = ''
        if proficiency_level:
            level_rules = {'beginner': 'Use simple language, keep the answer short, explain chess terms when used, avoid too many move lines.', 'intermediate': 'Include plans, common ideas, some notation, and practical advice.', 'advanced': 'Include theory, variations, strategic detail, precise chess language, and deep analysis.'}
            level_instruction = f'\nUser proficiency level: {proficiency_level}. {level_rules.get(proficiency_level, level_rules["intermediate"])}'
        
        prompt = f"""You are a friendly, instructional Chess Coach. Use the provided context from the {p_type} database to answer the question.{level_instruction}
Context:
{context_text}

Question: {question}
Answer:"""
        
        resp = post_json(f"{OLLAMA_URL}/api/generate", {
            "model": "phi3:mini",
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.3, "top_p": 0.85}
        })
        
        answer = resp.get("response", "I'm sorry, my language model failed to respond.").strip()
        
        # 5. Build openingLines from SAME evidence
        opening_lines = []
        if p_type == 'opening':
            opening_lines = self.group_opening_lines(final_evidence)
            
        # Fallback rule: if openingLines is empty but evidence has moves
        if p_type == 'opening' and not opening_lines:
            evidence_with_moves = [ev for ev in final_evidence if ev['category'] == 'opening' and ev.get('moves')]
            if evidence_with_moves:
                print(f"[OpeningLinesDebug] Fallback triggered: evidence had moves but opening_lines was empty.")
                opening_lines = self.group_opening_lines(evidence_with_moves)

        # Optional: Related but not used
        related_but_not_used = [ev for ev in all_evidence if ev['category'] == p_type and not ev['usedInAnswer'] and ev['relevance'] in ['strong', 'medium']]
        related_lines = self.group_opening_lines(related_but_not_used)

        print(f"[OpeningLinesDebug] evidenceUsed count: {len(final_evidence)}")
        print(f"[OpeningLinesDebug] evidenceUsed with moves count: {len([e for e in final_evidence if e.get('moves')])}")
        if final_evidence:
            move_sample = [e['openingName'] for e in final_evidence if e.get('moves')]
            print(f"[OpeningLinesDebug] evidenceUsed sample: {final_evidence[0]['sourceId']} - {final_evidence[0]['openingName']}")
            print(f"[OpeningLinesDebug] evidenceUsed with moves sample: {move_sample[:3]}")

        print(f"[OpeningLinesDebug] response has openingLines: {len(opening_lines) > 0}")
        print(f"[OpeningLinesDebug] response openingLines count: {len(opening_lines)}")
        if opening_lines:
            print(f"[OpeningLinesDebug] response openingLines sample: {opening_lines[0]['openingName']}")

        return {
            "classification": route,
            "answer": answer,
            "evidenceUsed": final_evidence,
            "openingLines": opening_lines,
            "relatedLines": related_lines
        }
