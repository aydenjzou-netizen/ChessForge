# Existing Release Rebuild and Phase 0 Rollback

## Rebuild from a clean checkout

Use the pinned runtime families and committed lock files:

1. Select Node 24 from `.nvmrc`.
2. Select Python 3.11 from `.python-version`.
3. Install root Node dependencies with `npm ci`.
4. Install backend Node dependencies with `npm ci --prefix backend`.
5. Create an isolated Python environment and install `requirements.txt`.
6. Keep `STORAGE_MODE=legacy`.
7. Start Express with `npm run backend`.
8. Start FastAPI with `python main.py`.
9. Run `npm run test:phase0`.

Ollama is optional for the non-external baseline. Analyst/Coach inference requires the pinned `phi3:mini` model.

## Phase 0 rollback

Phase 0 does not transform or delete legacy sources. To return to the previous behavior:

1. Stop both application processes.
2. Preserve logs and any Phase 0 test evidence.
3. Set `STORAGE_MODE=legacy` or temporarily use the compatible `STORAGE_DRIVER=filesystem`.
4. Use the pre-Phase 0 source revision `114a3110daf17f23cc9e916fd98cd055cd21a836` only in a separate checkout; do not overwrite the current dirty worktree.
5. Point the separate checkout at a copied data directory, not the live legacy source, for rehearsal.
6. Verify the Phase 0 snapshot with `npm run phase0:verify`.
7. Compare the source hashes with the snapshot manifest before reopening the service.

## Snapshot recovery

The snapshot is an ignored, local safety artifact. It includes copies of legacy structured runtime data and checksums for the large datasets. Recovery must be rehearsed into a new empty directory; never copy it over live data without a reviewed incident procedure.

