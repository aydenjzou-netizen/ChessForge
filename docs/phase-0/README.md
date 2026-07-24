# Phase 0 — Inventory and Safety Baseline

Phase 0 establishes a reversible baseline before any authoritative data migration.

## Status

| Work item | Status | Evidence |
|---|---|---|
| Persistence readers/writers inventoried | Complete | `persistence-inventory.md` |
| Feature ownership assigned | Complete | `persistence-inventory.md` |
| API routes and runtime dependencies inventoried | Complete | `runtime-baseline.md` |
| Migration control added | Complete | `STORAGE_MODE=legacy|dual-write|postgres`; `legacy` remains the default |
| Structured request logging added | Complete and tested | Node and Python request middleware |
| Runtime families pinned | Complete and tested | Node 24 in `.nvmrc`; Python 3.11 in `.python-version` |
| Legacy filesystem snapshot | Complete | Local ignored artifact under `scratch/phase0-snapshots/` |
| Counts, SHA-256 checksums, ID map | Complete | Snapshot manifest, checksums, summary, and CSV map |
| Browser `localStorage` export | Prepared, capture pending | `scripts/export_browser_local_storage.js` |
| Non-external test baseline | Complete | `test-results.md` |
| Repeatable consolidated verification | Complete | `npm run test:phase0` |
| Deployment/runtime version register | Complete | `infrastructure/versions.env` |
| Azure subscription/quota/budget actions | Awaiting subscription and budget selection | `azure-portal-register.md` |

No legacy runtime file is edited, renamed, moved, or deleted by the Phase 0 snapshot process.

## Migration control

`STORAGE_MODE` is the forward-looking switch:

- `legacy`: user-scoped local filesystem adapter; authoritative in Phase 0.
- `dual-write`: reserved and deliberately blocked until Phase 2 implements reconciliation.
- `postgres`: PostgreSQL adapter; requires `DATABASE_URL`.

The older `STORAGE_DRIVER=filesystem|postgres` setting remains temporarily compatible. Conflicting values fail startup instead of silently choosing a store.

## Local snapshot

Create a snapshot with:

```bash
npm run phase0:snapshot
```

To include a browser export:

```bash
npm run phase0:snapshot -- --browser-export /absolute/path/to/chessforge-browser-storage-....json
```

The output is intentionally written under ignored `scratch/phase0-snapshots/` because it contains user data. Large puzzle/vector datasets are hashed and inventoried but not duplicated. Legacy game/profile data and user-scoped adapter data are copied with timestamps.

## Phase 0 exit gates

- [x] Every known persistence path has an owner and migration disposition.
- [x] A stable legacy game-ID mapping rule is recorded.
- [x] The current source revision and dirty-worktree state are recorded.
- [x] Critical source data has a read-only copy, count, and checksum.
- [ ] Browser-held data has been exported from each used ChessForge origin/profile.
- [x] Proposed tests have been reviewed with the user.
- [x] Non-external baseline tests have passed and evidence has been recorded.
- [ ] Azure subscription, Southeast Asia quota, budget, and calculator estimate are recorded.
- [x] Cost-first pilot RPO/RTO and performance targets are recorded as the Phase 0 baseline.
