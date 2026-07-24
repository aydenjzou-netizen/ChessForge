# Phase 0 Test Results

**Execution window:** 24 July 2026, approximately 05:46–05:59 UTC  
**Baseline source revision:** `114a3110daf17f23cc9e916fd98cd055cd21a836`  
**Live legacy data policy:** Read-only  
**Mutation policy:** Temporary directories only

## Summary

| Group | Result | Notes |
|---|---|---|
| Static/safety checks | Pass | JavaScript and Python syntax, patch whitespace, migration contract, and credential-shaped-value scan passed |
| Node repository and migration-control suite | Pass | 7/7, including four repository regressions and three storage-mode tests |
| Existing Python classification script | Pass after maintenance | Updated to exercise the supported `CoachRAGEngine.route_query` contract without live inference |
| Non-external coach routing | Pass | Existing 3,627-chunk index loaded; opening, tactic, and endgame routing passed with supplied evidence |
| Snapshot integrity | Pass | 467/467 source hashes, 465/465 copied hashes, 457/457 metadata JSON files, and 457/457 ID rows |
| Express API smoke tests | Pass | Health, request ID, game CRUD, profile CRUD, isolation, invalid user, and production user requirement |
| Express log privacy | Pass | Synthetic PGN, player names, and title markers were absent from structured logs |
| FastAPI smoke tests | Pass after one fix | Static index, asset, SPA fallback, request ID, validation, and Ollama-unavailable behavior |
| Python 3.11 compatibility | Pass | Clean temporary environment using pinned requirements; FastAPI startup and smoke checks passed |
| Post-test source integrity | Pass | All 467 inventoried source hashes remained unchanged |
| Browser workflow | Deferred | Requires per-origin/profile browser export before mutations |
| Live Ollama/Phi-3 and embedding retrieval | Deferred | Ollama unavailable and explicit live-inference checkpoint retained |

## Detailed results

### Static and configuration

- JavaScript syntax passed for the Phase 0 server/config/logger/snapshot/export files.
- `main.py` and `coach_rag.py` parsed successfully.
- `git diff --check` passed.
- No private-key, storage-key, or credential-bearing database URL pattern was found in Phase 0 additions.
- Eight storage-mode contract assertions passed:
  - default is `legacy`
  - three valid modes parse
  - legacy driver compatibility maps correctly
  - unknown/conflicting values fail
- `STORAGE_MODE=dual-write` correctly refuses startup because Phase 2 has not enabled reconciliation.

### Repository regression tests

The four repository regressions passed under Node 23.11.0 and Node 24.14.0:

1. Canonical model removes duplicate legacy fields.
2. Local repository isolates users and preserves full PGN.
3. Training profiles are isolated per user.
4. Metadata-only refresh does not erase an existing PGN.

Three additional migration-control tests pass:

1. Legacy defaults and the temporary compatibility driver map correctly.
2. Unknown and conflicting storage configuration is rejected.
3. Dual-write remains unavailable until Phase 2 implements reconciliation.

### Python coach tests

The original classification script imported a removed `classify_coach_query` symbol. Phase 0 updated it to the supported `CoachRAGEngine.route_query` contract. The maintained test loads the existing 3,627-chunk vector index and passes opening, tactic, and endgame cases with controlled evidence and no live inference.

The retrieval/router scripts that call `query()` were not run because they invoke Ollama embedding or Phi-3 endpoints.

### Snapshot

| Assertion | Result |
|---|---:|
| Manifest entries | 467 |
| Source SHA-256 matches | 467 |
| Copied snapshot SHA-256 matches | 465 |
| Legacy game metadata parsed | 457 |
| Stable ID-map rows | 457 |
| Records needing an ID decision | 0 |
| Browser export | Not supplied |

### Express API

All writes used isolated `mktemp` directories.

- Filesystem health passed.
- Caller-supplied request ID was returned as `x-request-id`.
- Synthetic game save/list/read/isolation/delete passed.
- A second user could not list or read the first user’s game.
- Training profile create/read/delete passed.
- An explicitly malformed `x-user-id` returned 401.
- Development/test mode without a header used the configured local-user fallback, as designed.
- Production mode without a header returned 401; a valid UUID header succeeded.
- Logs did not contain synthetic private PGN, player, or title markers.

The `x-user-id` bridge remains unsuitable as production authentication; the test only verifies current isolation behavior.

### FastAPI

- Static index passed.
- Static asset passed.
- SPA fallback passed.
- Request-ID propagation passed.
- Chat and Coach validation errors returned 422 without invoking inference.
- Ollama-unavailable behavior passed.

Initial testing found that `/api/ollama-health` returned the complete internal connection error to the client. Phase 0 changed this to the generic `Ollama is unavailable` response and logs only the exception type. Generic Analyst and Coach exception responses were tightened at the same time. The affected syntax and smoke tests then passed.

### Runtime pins

- Node 24.14.0: JavaScript syntax and all four repository tests passed.
- Python 3.11.1: a clean temporary environment installed the exact `requirements.txt` versions; module import, FastAPI startup, static serving, request ID, and generic Ollama-health behavior passed.

### Integrity after tests

The SHA-256 of every one of the 467 inventoried source files still matches the pre-test manifest. No live legacy game, profile, puzzle, or vector-store file changed.

### Consolidated verification

`npm run test:phase0` passes as a single repeatable command. It covers seven Node tests, three non-external Coach routing classifications, 467 source hashes, 465 copied hashes, 457 metadata JSON records, 457 ID mappings, and a synthetic browser-export validation containing every critical key.

## Deferred test boundaries

1. Export browser storage from every used ChessForge origin/profile.
2. Verify the browser workflow without losing XP, streak, games, activity, or account state.
3. Run actual embedding retrieval.
4. Run one bounded Phi-3 analysis request.
5. Rehearse browser-data import/rollback after the export exists.
