# PostgreSQL: local setup and Azure migration

The application schema is native PostgreSQL (`uuid`, `jsonb`, arrays, identity columns,
partial indexes, and `timestamptz`). The same migrations are used locally and on Azure
Database for PostgreSQL Flexible Server, so no schema translation is required.

## 1. Prepare the local database

Install Docker Desktop, then from the repository root run:

```sh
npm run db:local:up
npm run db:local:prepare
```

`db:prepare` applies every migration, imports the legacy files from `backend/game-storage`,
and verifies the expected tables and key row counts. It is safe to repeat: migrations and
game imports are idempotent.

Keep `STORAGE_MODE=legacy` until the imported row counts and application behavior have been
checked. Switch to `postgres` only when PostgreSQL should become authoritative.

## 2. Create the Azure target

Create an Azure Database for PostgreSQL Flexible Server and an empty `chessforge` database.
Allow the migration machine through the firewall or private network. Use a dedicated
application login; do not commit its password or connection URL.

Apply the schema directly to Azure:

```sh
cd backend
export DATABASE_URL='postgresql://APP_USER:PASSWORD@SERVER.postgres.database.azure.com:5432/chessforge?sslmode=verify-full'
npm run db:migrate
npm run db:verify
```

This is the simplest route if the authoritative data is still in the legacy files: point
`DATABASE_URL` at Azure and run `npm run storage:import` after the migrations.

## 3. Move an already-populated local PostgreSQL database

Use PostgreSQL client tools from the same major version as the Azure target (or newer):

```sh
pg_dump --format=custom --no-owner --no-acl \
  --dbname='postgresql://chessforge:local-development-only@localhost:5432/chessforge' \
  --file=chessforge.dump

pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error \
  --dbname='postgresql://APP_USER:PASSWORD@SERVER.postgres.database.azure.com:5432/chessforge?sslmode=verify-full' \
  chessforge.dump
```

The restore command replaces objects in the target database. Use a new/empty Azure database,
retain the local database and dump during rollback, then run `npm run db:verify` against Azure.

## Cutover checklist

1. Stop writes to the legacy store.
2. Run the final import or dump/restore.
3. Run `npm run db:verify` and compare game/profile counts.
4. Start the service with Azure `DATABASE_URL` and `STORAGE_MODE=postgres`.
5. Check `/api/health`, read several games, and perform one reversible write/delete test.
6. Keep the legacy data and dump until the rollback window ends.
