# Persistence and Feature Ownership Inventory

## Executive finding

ChessForge currently has five persistence classes:

1. Legacy game/profile JSON under `backend/game-storage`.
2. A newer user-scoped local adapter under `backend/app-data`.
3. Critical browser `localStorage`.
4. Large puzzle and coach retrieval datasets.
5. In-progress PostgreSQL migrations and repository code.

The running frontend also depends on two application servers: FastAPI on port 8001 for the UI and AI routes, and Express on port 3001 for games/training storage.

## Filesystem stores

| Store | Current contents | Readers | Writers | Current authority | Target owner/disposition |
|---|---|---|---|---|---|
| `backend/game-storage/<id>/metadata.json` | 457 metadata-only game records | Legacy `gameFileStore.js`; import script | Legacy `gameFileStore.js` | Legacy game library | Games; migrate to PostgreSQL metadata and later Blob-backed PGNs |
| `backend/game-storage/skill-profile.json` | Training profile | Legacy training code/import script | Legacy training code | Legacy training | Training; migrate to user-scoped PostgreSQL |
| `backend/game-storage/skill-profile 2.json`, `skill-profile 3.json` | Historical/duplicate profile candidates | Import script candidate list | No active writer identified | Archive candidates | Training; reconcile by timestamp/content before migration |
| `backend/app-data/users/<user-id>/games/*.json` | User-scoped canonical local games | `LocalRepository` | `LocalRepository` | Selected when `STORAGE_MODE=legacy` | Phase 0 safe local authority; later PostgreSQL |
| `backend/app-data/users/<user-id>/training-profile.json` | One user-scoped training profile | `LocalRepository` | `LocalRepository` | Selected when `STORAGE_MODE=legacy` | Training; later PostgreSQL |
| `data/puzzles/lichess_db_puzzle.csv` | Approx. 1 GB puzzle corpus | Puzzle preparation/retrieval scripts | Dataset preparation process | Puzzle source dataset | Puzzle System; later Blob chunks/searchable index |
| `coach_vector_store.json` | Approx. 56 MB derived retrieval index | `coach_rag.py` | Reindex/lazy initialization | Coach retrieval cache | Analysis/Coach; rebuildable artifact, later external object/cache |
| `knowledge_base/openings.csv` | Opening knowledge source | Coach indexing | Maintained source file | Coach knowledge | Analysis/Coach |

### Legacy-data observation

All 457 game directories currently contain only `metadata.json`; their records indicate `metadata-only`. The original PGN/AI text payloads are not present in these directories. Browser-held `chess_saved_games` or a remote source may therefore be the only remaining source for full PGNs and must be exported before retirement.

## Browser `localStorage`

| Key | Data | Reads/writes | Target owner | Critical? |
|---|---|---|---|---|
| `chess_saved_games` | Legacy browser game library, potentially full PGNs | `static/app.js`, Training UI | Games | Yes |
| `chess_saved_games_pending` | Pending migration state | `static/app.js` | Games | Yes during migration |
| `chess_account_profiles` | Per-Chess.com/local profiles, XP, stats, activity, profile state | `static/app.js` | Profile, Training, Puzzle Progress, Statistics | Yes |
| `chess_active_profile_username` | Active profile selector | `static/app.js` | Profile | Yes until real identity exists |
| `chess_account_profiles_migrated_from_global` | Legacy migration marker | `static/app.js` | Migration audit | Yes during migration |
| `training_player_profile` | XP, levels, attempts, puzzle IDs, boss state, streak data | App and Training UI | Training/Puzzle Progress | Yes |
| `training_total_xp` | Global/compatibility XP | App and Training UI | Puzzle Progress/Statistics | Yes |
| `training_current_streak` | Global/compatibility streak | App and Training UI | Puzzle Progress/Statistics | Yes |
| `training_weakness_profile` | Weakness analysis and recommendations | App and Training UI | Training/Analysis | Yes |
| `chess_recent_activity` | Recent activity feed | App and Training UI | Statistics/Activity | Yes |
| `chess_com_username` | Linked provider username | `static/app.js` | Chess.com Account | Yes |
| `chess_com_last_sync_at` | Last sync timestamp | `static/app.js` | Chess.com Account | Yes |
| `chess_profile_username` | Display name compatibility value | `static/app.js` | Profile | Yes |
| `chess_profile_avatar_piece` | Avatar choice | `static/app.js` | Profile/Preferences | User preference |
| `chess_profile_avatar_theme` | Avatar theme | `static/app.js` | Profile/Preferences | User preference |
| `chessSkillLevel` | Coach explanation level | `static/app.js` | Preferences/Coach | User preference |
| `chess_current_sort` | Library sort | `static/app.js` | Preferences | Disposable |
| `play_computer_stockfish_elo` | Local engine strength | `static/playComputer.js` | Preferences | Disposable |

The browser-export helper also captures any unknown keys on the current origin, preventing undocumented state from being missed.

## PostgreSQL work already present

Uncommitted, user-owned work includes:

- Migrations for users, external accounts, games, training profiles, weaknesses, analyses, puzzle sessions/attempts, and activity.
- PostgreSQL and user-scoped local repository implementations.
- A legacy import script.
- Express routes updated to use a repository abstraction and a temporary `x-user-id` bridge.

Phase 0 does not revert, replace, or execute those migrations. It keeps legacy mode authoritative and documents the work for Phase 2.

## Feature ownership

| Feature | Owns | Must not own |
|---|---|---|
| Profile | Display name, avatar, account status | XP, games, provider sync cursor |
| Preferences | Board/UI choices, coach detail level, engine strength | Critical progress |
| Chess.com Account | Provider username, link state, sync cursor/timestamp | Profile identity or game payload |
| Games | Game metadata, source IDs, ownership, PGN/blob reference | Training progress |
| Analysis | Stockfish results, AI explanation, analysis status | Raw profile/preferences |
| Training | Weakness model and training recommendations | Game source of truth |
| Puzzle Progress | Attempts, completed IDs, XP, streak, boss/progression state | Provider credentials |
| Statistics/Activity | Derived aggregates and activity feed | Primary game/progress mutation |
| Jobs | Durable background-job state and retries | User-facing domain records except by explicit completion transaction |

## Stable identity rule

- Valid legacy game UUIDs map to the same target game UUID.
- Every imported record maps to the explicitly configured `MIGRATION_USER_ID`; Phase 0’s local default is `00000000-0000-4000-8000-000000000001`.
- Non-UUID or malformed IDs must not receive random IDs during migration. They are marked `requires-stable-id-decision` in `legacy-id-map.csv`.
- Provider identities use the tuple `(user_id, provider, external_game_id)` for idempotency when available.
- Source path, SHA-256, migration timestamp, and target identity must be retained in the future migration audit.

## Risks discovered

1. Critical data still exists only in browser storage.
2. Legacy games are metadata-only, so PGN recovery must be verified before deletion.
3. `skill-profile.json` has numbered duplicates requiring reconciliation.
4. The frontend hard-codes the Express origin as `http://localhost:3001`.
5. FastAPI CORS currently allows all origins with credentials.
6. The Express `x-user-id` mechanism is explicitly temporary and is not production authentication.
7. The puzzle CSV and vector store must not be copied into normal VM application images.
8. The repository has only one committed baseline and substantial user-owned uncommitted PostgreSQL work, so Phase 0 changes must remain independently reviewable.

