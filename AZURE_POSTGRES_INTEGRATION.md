# ChessForge: Azure PostgreSQL Integration

The application is prepared to run with either the local filesystem repository or PostgreSQL. Keep `STORAGE_DRIVER=filesystem` until the Azure database is provisioned and verified. Both drivers expose the same API and use the same canonical, user-scoped game model.

## What is already prepared

- Games and training profiles are isolated by UUID user ID.
- Legacy duplicate fields are converted into canonical fields.
- PGN and AI text are stored without application-level gzip.
- Chess.com games are deduplicated per user and external game ID.
- Library replacement is transactional in PostgreSQL.
- SQL uses parameters rather than string interpolation.
- The database schema is versioned in `backend/migrations`.
- `backend/scripts/importLegacyStorage.js` is repeatable and leaves legacy files untouched.
- Production refuses the unauthenticated local-user fallback.

## 1. Provision Azure Database for PostgreSQL

In Azure Portal, create **Azure Database for PostgreSQL Flexible Server**.

Recommended initial settings:

- Put the server in the same Azure region as the ChessForge backend.
- Choose a small development/burstable compute tier initially.
- Enable automated backups.
- Use PostgreSQL and Microsoft Entra authentication during initial setup, or password authentication temporarily.
- For the first local connection, add only your current public IP to the firewall.
- Do not enable “allow all Azure services” unless it is temporarily required and understood.
- For production, prefer private networking between the backend and database.

Create an empty database named `chessforge`.

## 2. Create an application database identity

Do not run the application as the PostgreSQL administrator. Create a restricted login for the application during the initial password-based setup:

```sql
CREATE ROLE chessforge_app LOGIN PASSWORD '<strong-generated-password>';
GRANT CONNECT ON DATABASE chessforge TO chessforge_app;
GRANT USAGE, CREATE ON SCHEMA public TO chessforge_app;
```

After migrations are installed, remove `CREATE` from the runtime identity if migrations will use a separate deployment identity.

For the final production deployment, replace the permanent password with the backend's Azure managed identity and a Microsoft Entra PostgreSQL principal.

## 3. Configure the local backend

From `backend/.env.example`, create an untracked `backend/.env` or export variables in the shell. This project does not automatically load `.env`, so exported variables are the simplest current option:

```bash
cd "/Users/aydenj.zou/Documents/Chess System/backend"

export DATABASE_URL='postgresql://chessforge_app:<password>@<server>.postgres.database.azure.com:5432/chessforge?sslmode=verify-full'
```

If the local certificate trust store cannot verify Azure's certificate, install/configure the Microsoft trusted root CA rather than disabling TLS verification. `sslmode=require` may be used briefly for diagnosing certificate configuration, but production should verify the server identity.

Do not commit `DATABASE_URL`, passwords, certificates, or `.env` files.

## 4. Apply the schema

Run the versioned migration:

```bash
npm run db:migrate
```

The command is safe to rerun. It records completed files in `schema_migrations`.

Verify with `psql` or an Azure query editor:

```sql
SELECT filename, applied_at
FROM schema_migrations
ORDER BY filename;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expect account, game, analysis, training, puzzle-session, and activity tables. The coach-vector tables should be added only after the Azure OpenAI embedding model and its vector dimensions have been selected.

## 5. Import the existing local records

Use the UUID that should own the existing library. Until the real account exists, the prepared local migration identity is:

```text
00000000-0000-4000-8000-000000000001
```

Import into PostgreSQL:

```bash
export STORAGE_DRIVER=postgres
export MIGRATION_USER_ID='00000000-0000-4000-8000-000000000001'
export LEGACY_STORAGE_DIR='/Users/aydenj.zou/Documents/Chess System/backend/game-storage'

npm run storage:import
```

The expected result for the current snapshot is:

```text
scanned: 457
imported: 457
failed: 0
```

The importer is idempotent: already-present IDs are skipped. It does not delete or modify the source directory.

Verify ownership and content:

```sql
SELECT user_id, count(*)
FROM games
GROUP BY user_id;

SELECT
    count(*) AS total,
    count(*) FILTER (WHERE import_state = 'metadata_only') AS metadata_only,
    count(*) FILTER (WHERE pgn IS NOT NULL) AS full_games
FROM games;

SELECT count(*) FROM training_profiles;
```

The current legacy snapshot contains 457 metadata-only records and no stored full PGNs.

## 6. Test locally against Azure

Keep these variables set:

```bash
export STORAGE_DRIVER=postgres
export DATABASE_URL='postgresql://...'
export NODE_ENV=development
npm start
```

If `npm start` is not defined, run:

```bash
node server.js
```

Test the health and library endpoints:

```bash
curl -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  http://localhost:3001/api/health

curl -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  http://localhost:3001/api/games
```

Before switching production traffic, verify:

- A PGN can be uploaded, retrieved, and deleted.
- Chess.com synchronization can run twice without duplicates.
- A metadata-only record can later receive its full PGN.
- One user ID cannot read or delete another user's games.
- Training profiles remain different for two user IDs.
- A failed library replacement rolls back without losing the old library.
- Restarting the backend does not lose data.
- A database outage produces an error instead of an empty library.

Run automated local tests as well:

```bash
npm test
```

## 7. Add real authentication before public hosting

The current `x-user-id` handling is a development bridge, not authentication. In production, the server intentionally has no default user, but a caller could still forge that header unless it is replaced.

Before launch:

1. Select an authentication provider.
2. Verify its signed access token in Express middleware.
3. Read the stable provider subject from the verified token.
4. Resolve or create the corresponding `users` record.
5. Set `req.user.id` from that database record.
6. Remove trust in the public `x-user-id` header.
7. Reassign the migration user's games to the real owner's user ID if necessary.

Example reassignment inside a transaction:

```sql
BEGIN;
UPDATE games SET user_id = '<real-user-uuid>'
WHERE user_id = '00000000-0000-4000-8000-000000000001';

UPDATE training_profiles SET user_id = '<real-user-uuid>'
WHERE user_id = '00000000-0000-4000-8000-000000000001';
COMMIT;
```

## 8. Configure the deployed backend

Add these as Azure App Service or Container Apps configuration values, not source files:

```text
NODE_ENV=production
STORAGE_DRIVER=postgres
DATABASE_URL=<secret connection string>
DB_POOL_SIZE=10
```

Then:

1. Run `npm run db:migrate` as a deployment step using the migration identity.
2. Start the new backend version.
3. Check `/api/health` through authenticated infrastructure.
4. Perform a save/read/delete smoke test.
5. Watch Application Insights for database and authorization errors.
6. Only then direct normal traffic to the deployment.

Keep PostgreSQL, the backend, and any connection pooler in the same region. Start with a pool of 10 connections and tune it using observed concurrency and the server connection limit.

## 9. Rollback strategy

Do not delete these until the PostgreSQL deployment has been stable and backed up:

- `backend/game-storage` — untouched legacy source
- `backend/app-data` — canonical local copy

To roll the local application back temporarily:

```bash
unset DATABASE_URL
export STORAGE_DRIVER=filesystem
node server.js
```

Database migrations should be rolled forward with a corrective migration. Avoid manually editing a production schema or deleting migration history.

## 10. Production completion checklist

- [ ] Azure PostgreSQL Flexible Server provisioned
- [ ] TLS certificate verification working
- [ ] Restricted application identity created
- [ ] Schema migration applied
- [ ] Existing 457 games imported and counted
- [ ] Training profile imported
- [ ] Real token verification replaces `x-user-id`
- [ ] Cross-user access tests pass
- [ ] Automated backups verified
- [ ] Private network access configured where possible
- [ ] Application Insights alerts enabled
- [ ] Deployment smoke test passes
- [ ] Legacy filesystem backups retained through the rollback window
