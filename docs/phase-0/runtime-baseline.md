# Runtime, API, and Deployment Baseline

## Source baseline

- Repository: `https://github.com/aydenjzou-netizen/ChessForge.git`
- Branch: `main`
- Baseline commit before Phase 0 changes: `114a3110daf17f23cc9e916fd98cd055cd21a836`
- Existing worktree: dirty before Phase 0; PostgreSQL/storage changes are user-owned.
- Committed history: one initial import commit.

## Runtime families

| Component | Phase 0 pin | Observed developer runtime | Dependency lock |
|---|---|---|---|
| Node.js | 24 (`.nvmrc`) | 23.11.0; Node 24.14.0 validation runtime available | root and backend `package-lock.json` |
| Python | 3.11 (`.python-version`) | 3.13.1 | exact versions in `requirements.txt` |
| Ollama model | `phi3:mini` | Configured in `main.py` | Model binary is external |
| PostgreSQL | 16.14 / major 16 | Not required in legacy mode | SQL migrations present |
| Stockfish WebAssembly | Repository artifact | `static/stockfish.wasm` | Repository artifact |

Node 24 and Python 3.11 are the intended deployment families and passed the Phase 0 compatibility checks. The planned container and service tags are recorded in `infrastructure/versions.env`. Immutable registry digests must be recorded when images are pulled for the Phase 6 production deployment.

## Configuration and environment inventory

### FastAPI / AI service

| Variable | Default | Purpose | Sensitive |
|---|---|---|---|
| `HOST` | `0.0.0.0` | Bind address when run through `main.py` | No |
| `PORT` | `8001` | FastAPI port | No |
| `RELOAD` | `true` | Local reload behavior; must be false in production | No |
| `LOG_LEVEL` | `INFO` | Structured application log level | No |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama service origin | No |
| `OLLAMA_MODEL` | `phi3:mini` | Pinned model tag | No |
| `MAX_PROMPT_CHARS` | `6000` | Analyst prompt budget | No |

The reference values are in the root `.env.example`.

### Express storage/training service

| Variable | Default | Purpose | Sensitive |
|---|---|---|---|
| `PORT` | `3001` | Express port | No |
| `NODE_ENV` | `development` behavior | Enables the local-user fallback outside production | No |
| `STORAGE_MODE` | `legacy` | Migration authority control | No |
| `STORAGE_DRIVER` | unset | Temporary compatibility setting | No |
| `LOCAL_STORAGE_DIR` | `backend/app-data` | User-scoped local adapter root | Path |
| `LOCAL_USER_ID` | fixed development UUID | Development-only user bridge | No |
| `DATABASE_URL` | none | PostgreSQL connection string | **Yes** |
| `DB_POOL_SIZE` | `10` | PostgreSQL pool limit | No |
| `MIGRATION_USER_ID` | local user ID | Explicit legacy import owner | No |
| `LEGACY_STORAGE_DIR` | `backend/game-storage` | Read-only migration source | Path |

Reference values are in `backend/.env.example`.

### Frontend

The current frontend has no build-time environment-variable loader.

- `API_BASE=/api` is same-origin to FastAPI.
- `STORAGE_API_BASE=http://localhost:3001/api` is hard-coded in `static/app.js`.
- `TRAINING_API_BASE=http://localhost:3001/api/training` and several game URLs are hard-coded in `static/training/trainingCoachUI.js`.
- Chess.com public API URLs are assembled in browser code.

These hard-coded origins are recorded migration work for Phase 1/8; Phase 0 does not silently change runtime routing.

## Scheduled and background behavior

- No server cron job, queue worker, or OS scheduler exists.
- On frontend startup, `startBackgroundChessComSync()` schedules one incremental sync after 750 ms when a Chess.com username is present. It is not a recurring server-side schedule.
- Training boss timers and UI delays are session-only browser timers.
- Vector reindexing is manual through `scripts/reindex_coach.py` or lazy coach behavior; it is not scheduled.
- Puzzle preparation is manual through `scripts/prepare_puzzles.py`.

## Processes

| Process | Command | Port | Responsibility |
|---|---|---|---|
| FastAPI | `python main.py` | 8001 | Static UI, Analyst chat, Coach chat, Ollama health |
| Express | `npm run backend` | 3001 | Games repository, training profile/analysis/puzzles |
| Vite development server | `npm run frontend` | Dynamic development port | Frontend development |
| Ollama | External local process | 11434 | Phi-3 inference |
| Stockfish | Browser WebAssembly and server training code | In-process | Chess evaluation |

## FastAPI routes

| Method | Route | Function |
|---|---|---|
| POST | `/api/chat` | Game-specific Phi-3 analyst |
| GET | `/api/ollama-health` | Ollama reachability |
| POST | `/api/coach` | General coach retrieval/response |
| GET | `/{full_path:path}` | Static assets and SPA fallback |

## Express routes

| Method | Route | Persistence impact |
|---|---|---|
| POST | `/api/games` | Writes a user-owned game |
| GET | `/api/games` | Lists user-owned games |
| PUT | `/api/games/library` | Replaces a user’s library |
| GET | `/api/games/:id` | Reads one user-owned game |
| DELETE | `/api/games/:id` | Deletes one user-owned game |
| POST | `/api/backfill` | Mutates AI text for eligible games |
| GET | `/api/training/profile` | Reads user training profile |
| GET | `/api/training/skill-profile` | Compatibility alias |
| POST | `/api/training/skill-profile` | Writes user training profile |
| DELETE | `/api/training/skill-profile` | Deletes user training profile |
| POST | `/api/training/analyze` | Computes and writes profile |
| GET | `/api/training/puzzles` | Reads puzzle dataset/profile |
| GET | `/api/health` | Checks selected repository |

## External calls

- Ollama: `http://localhost:11434/api/generate`.
- Chess.com public APIs: invoked by frontend sync functions.
- Frontend to Express: hard-coded `http://localhost:3001/api`.
- Frontend to FastAPI: same-origin `/api`.

## Structured logging baseline

Phase 0 adds:

- Incoming/request-provided or generated request IDs.
- `x-request-id` response headers.
- JSON request-completion records containing service, route/path, method, status, and latency.
- User ID in Express logs when available.
- Event-based error logs without request bodies, PGNs, prompts, cookies, authorization headers, passwords, tokens, or database URLs.
- AI metadata such as category and evidence count without the user’s question, prompt, FEN preview, or PGN.

## Provisional pilot targets

These targets are the accepted Phase 0 cost-first pilot baseline. They may be revised by an explicit operational decision before cutover:

| Measure | Initial target |
|---|---|
| Non-AI API p95 | ≤ 500 ms under pilot load |
| Static page usability | Interactive within 3 seconds on a typical Malaysia broadband connection |
| Analysis queue age | ≤ 5 minutes for normal pilot traffic |
| Heavy-job concurrency | 1 |
| Completed-job failure rate | < 2%, excluding invalid user input |
| PostgreSQL logical-backup RPO | 24 hours initially |
| Service restore RTO | 4 hours initially |
| Data isolation | Zero cross-user reads/writes |

These are planning targets, not an external SLA. Phase 4/5 measurements may tighten or revise them.
