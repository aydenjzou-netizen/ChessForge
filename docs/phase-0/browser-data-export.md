# Browser Data Export

Browser `localStorage` is scoped by browser profile and origin. Export each origin/profile that has been used for ChessForge, commonly:

- `http://localhost:8001`
- Any Vite development origin previously used
- Any deployed ChessForge origin

## Procedure

1. Open ChessForge on the relevant origin.
2. Open the browser developer tools and select **Console**.
3. Open `scripts/export_browser_local_storage.js` from the repository.
4. Copy the complete IIFE into the console and run it.
5. Confirm the browser downloads `chessforge-browser-storage-<timestamp>.json`.
6. Do not edit the export.
7. Include it in a new Phase 0 snapshot:

   ```bash
   npm run phase0:snapshot -- --browser-export /absolute/path/to/the/export.json
   ```

8. Check the snapshot `summary.json` reports `"browserExportIncluded": true`.
9. Retain the downloaded export and snapshot through the migration rollback window.

The helper reads all keys on that origin and does not modify `localStorage`.

