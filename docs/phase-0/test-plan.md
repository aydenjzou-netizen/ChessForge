# Phase 0 Test Plan

The pre-test checkpoint was reviewed and approved. Results are recorded in `test-results.md`.

## Test groups

### 1. Static and configuration checks

- Parse JavaScript and Python source without executing application behavior.
- Verify `STORAGE_MODE` accepts `legacy`, rejects unknown values, rejects conflicting legacy configuration, and deliberately blocks `dual-write`.
- Verify no committed secret or real database connection string was introduced.
- Verify runtime pin files and dependency locks are present.

### 2. Existing unit/regression tests

- Run the existing Node storage test suite in temporary directories.
- Run existing Python coach classification, retrieval, router, and variation tests.
- Capture pass/fail, duration, runtime version, and whether Ollama/datasets are required.

### 3. Snapshot integrity

- Recompute SHA-256 for each copied legacy file and compare it to the manifest.
- Compare source and snapshot file counts and byte counts.
- Validate all 457 metadata JSON files parse.
- Validate the ID map has one row per game and no unintended random target IDs.
- If a browser export is supplied, validate its schema, origin, key list, and hash without printing values.

### 4. Express API smoke tests

Use an isolated temporary `LOCAL_STORAGE_DIR`; never point mutation tests at `backend/game-storage` or the live `backend/app-data`.

- Start in `STORAGE_MODE=legacy`.
- Check request ID and structured log output.
- Exercise health, save/list/read/delete game, training profile save/read/delete, and user isolation.
- Confirm no PGN or request body appears in logs.
- Confirm `STORAGE_MODE=dual-write` refuses to start.

### 5. FastAPI smoke tests

- Start the API without invoking paid/external inference.
- Check static UI and SPA fallback.
- Check request ID and structured request log.
- Check Ollama health behavior both reachable and unavailable where possible.
- Submit only validation-error requests to chat/coach unless the user approves live model inference.
- Confirm prompts/questions are absent from structured logs.

### 6. Manual browser workflow

- Export browser storage before mutation.
- Load dashboard/profile/library.
- Verify profile, Chess.com state, game library, training progress, XP, streak, activity, and preferences remain unchanged.
- Import/create/delete only designated test records.
- Exercise a puzzle and verify expected progress behavior.
- Test Stockfish WebAssembly separately from Ollama.
- If approved, run one Phi-3 analyst request with a small test PGN.

### 7. Rollback rehearsal

- Restore an isolated copy from the Phase 0 snapshot.
- Compare hashes and counts.
- Revert configuration to `STORAGE_MODE=legacy`.
- Confirm the previous application revision can be identified and rebuilt without modifying the current user data.

## Evidence format

Results will be recorded in `docs/phase-0/test-results.md` with:

- Timestamp and exact command/workflow.
- Runtime and source revision.
- Pass/fail/blocked status.
- Sanitized output or metric.
- Files or data stores touched.
- Rollback performed.
- Follow-up owner and severity for failures.
