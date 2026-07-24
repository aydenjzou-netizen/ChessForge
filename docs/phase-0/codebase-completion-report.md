# Phase 0 Codebase Completion Report

**Status:** Complete for repository-controlled work  
**Baseline revision:** `114a3110daf17f23cc9e916fd98cd055cd21a836`
**Final consolidated verification:** Passed on 24 July 2026

## Completed

- Persistence readers/writers and feature ownership are inventoried.
- Current APIs, processes, environment settings, external calls, scheduled behavior, and authentication bridge are documented.
- `STORAGE_MODE=legacy|dual-write|postgres` exists with safe defaults and conflict detection.
- `dual-write` cannot be enabled before Phase 2 reconciliation exists.
- Node and Python request logging includes request ID, route/path, status, latency, and safe user context.
- Sensitive bodies, PGNs, prompts, credentials, and tokens are excluded from structured logging.
- Runtime, planned container, PostgreSQL, Ollama model, and migration-format versions are registered.
- Legacy structured data has a read-only local copy.
- All source datasets have counts and SHA-256 records.
- All 457 legacy game records have a stable identity mapping.
- Browser export and validation tools exist and never print stored values.
- Repeatable snapshot and consolidated verification commands exist.
- Seven Node repository/migration-control tests, three non-external coach classifications, snapshot integrity, browser-export validation, Express smoke checks, FastAPI smoke checks, environment overrides, and pinned-runtime checks have passed.
- Rebuild and rollback instructions are documented.
- Cost-first pilot performance/RPO/RTO targets are recorded.

## Repeatable commands

```bash
npm run phase0:snapshot
npm run phase0:verify
npm run test:phase0
npm run phase0:browser:validate -- --input /absolute/path/browser-export.json
```

## External-only completion items

These are not codebase gaps:

1. Capture browser exports from each real origin/browser profile containing ChessForge data.
2. Run the manual browser workflow against those real origins after export.
3. Start Ollama and run the separately approved live embedding/Phi-3 checks.
4. Select the Azure subscription and provide budget/currency/alert recipients.
5. Perform the ordered Azure Portal quota, resource-group, budget, and calculator actions.

Until the browser export is captured, do not retire browser storage or the metadata-only legacy game library. Until Azure inputs are supplied, no Azure resource should be inferred or created.
