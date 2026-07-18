#!/usr/bin/env python3
import csv
from datetime import datetime
import io
import json
from pathlib import Path

try:
    import zstandard as zstd
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: zstandard\n"
        "Install it with: python3 -m pip install zstandard"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
PUZZLE_DIR = ROOT / "data" / "puzzles"
DEFAULT_SOURCE = PUZZLE_DIR / "puzzles.csv.zst"
LICHESS_SOURCE = PUZZLE_DIR / "lichess_db_puzzle.csv.zst"
OUTPUT_PATH = PUZZLE_DIR / "puzzles.processed.json"
ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"
ZSTD_SKIPPABLE_PREFIX = b"\x50\x2a\x4d\x18"


def source_path() -> Path:
    if DEFAULT_SOURCE.exists():
        return DEFAULT_SOURCE
    return LICHESS_SOURCE


def validate_zst_source(source: Path) -> None:
    with source.open("rb") as f:
        header = f.read(4)

    if header == ZSTD_MAGIC or header == ZSTD_SKIPPABLE_PREFIX:
        return

    raise SystemExit(
        f"{source} does not look like a Zstandard file.\n"
        "Do not open or save the .zst file as text. Re-download the compressed puzzle dataset, "
        "then run: python3 scripts/prepare_puzzles.py"
    )


def split_themes(value: str) -> list[str]:
    return [part.strip() for part in value.replace(",", " ").split() if part.strip()]


def normalize_row(row: dict) -> dict | None:
    puzzle_id = row.get("PuzzleId") or row.get("PuzzleID") or row.get("id")
    fen = row.get("FEN") or row.get("Fen") or row.get("fen")
    moves = row.get("Moves") or row.get("moves")

    if not puzzle_id or not fen or not moves:
        return None

    rating_raw = row.get("Rating") or row.get("rating") or ""
    try:
        rating = int(float(rating_raw)) if rating_raw else None
    except ValueError:
        rating = None

    themes = split_themes(row.get("Themes") or row.get("themes") or "")
    description = row.get("Description") or row.get("description")
    if not description:
        description = (
            f"Practice puzzle with themes: {', '.join(themes)}"
            if themes
            else "Practice puzzle from the database."
        )
    source = row.get("Source") or row.get("GameUrl") or row.get("source") or "puzzle-dataset"

    return {
        "puzzleId": puzzle_id,
        "fen": fen,
        "moves": moves,
        "rating": rating,
        "themes": themes,
        "description": description,
        "source": source,
    }


def main() -> None:
    source = source_path()
    print("[PuzzleDataset] Source: /data/puzzles/puzzles.csv.zst")

    if not source.exists():
        raise SystemExit(
            "Puzzle source not found. Expected /data/puzzles/puzzles.csv.zst "
            "or /data/puzzles/lichess_db_puzzle.csv.zst"
        )

    validate_zst_source(source)

    print("[PuzzleDataset] Decompressing ZST file")
    parsed_rows = 0
    processed = []

    try:
        with source.open("rb") as compressed:
            reader = zstd.ZstdDecompressor().stream_reader(compressed)
            text_stream = io.TextIOWrapper(reader, encoding="utf-8", newline="")
            for row in csv.DictReader(text_stream):
                parsed_rows += 1
                puzzle = normalize_row(row)
                if puzzle:
                    processed.append(puzzle)
    except zstd.ZstdError as exc:
        raise SystemExit(
            f"Could not decompress {source}: {exc}\n"
            "The file appears to be corrupted or not a valid .zst stream. "
            "Re-download the puzzle dataset without opening or converting it, then run: "
            "python3 scripts/prepare_puzzles.py"
        ) from exc

    print(f"[PuzzleDataset] CSV rows parsed: {parsed_rows}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as out:
        json.dump(
            {
                "source": "/data/puzzles/puzzles.csv.zst",
                "preparedAt": datetime.utcnow().isoformat() + "Z",
                "puzzles": processed,
            },
            out,
            ensure_ascii=False,
        )

    print("[PuzzleDataset] Processed puzzles saved: /data/puzzles/puzzles.processed.json")


if __name__ == "__main__":
    main()
