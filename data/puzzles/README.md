# Puzzle Database

Training Coach reads prepared puzzle data from `data/puzzles/puzzles.processed.json`.

If your source puzzle dataset is compressed as `puzzles.csv.zst` or
`lichess_db_puzzle.csv.zst`, do not open it directly and do not parse it at
runtime. Prepare it once with:

```bash
python3 scripts/prepare_puzzles.py
```

The script decompresses the Zstandard file, parses the CSV, normalizes rows, and
writes `data/puzzles/puzzles.processed.json`.

Source CSV columns supported:

```csv
PuzzleId,FEN,Moves,Rating,Themes,Description,Source
```

Column meanings:

- `PuzzleId`: unique puzzle ID.
- `FEN`: starting position of the puzzle.
- `Moves`: correct solution line in SAN or UCI-style notation, separated by spaces.
- `Rating`: puzzle difficulty.
- `Themes`: space-separated or comma-separated tags.
- `Description`: short human-friendly puzzle description.
- `Source`: where the puzzle came from, if known.

The Training Coach only recommends puzzles that exist in this CSV. It should not generate puzzle positions with AI.
