# Local operations and installable apps

## Environment and migrations

The apps remain independently runnable on ports 3001 and 3002. Copy each app's `.env.example` to its ignored `.env.local`, and configure the same local PostgreSQL database. Keep each app's `APP_ORIGIN` equal to its actual browser origin. Root `.env` is used by Prisma and operator scripts. Do not commit real connection strings.

After starting the local database, apply migrations:

```sh
npm run db:deploy
npm run db:generate
npm run dev
```

All 18 migrations are applied to this machine’s PostgreSQL 16.15 database as of November 10. Verification has resumed. `npm run setup` creates missing app environment files from the root configuration and preserves existing files. On this machine, restart the existing database with `bash .local/start-database.sh`; Docker is not required for that installation. Use the `--local` backup option below for that installation; Docker is not needed.

## Backups

Choose the database explicitly. The default uses the Compose PostgreSQL container; `--local` uses root `.env` / `DATABASE_URL` and native PostgreSQL tools:

```sh
# This machine's native PostgreSQL database
npm run db:backup -- --local

# Docker Compose database
npm run db:backup
```

Native mode only accepts loopback PostgreSQL connections and the public application schema. Tools come from `BARBER_PG_BIN` if set, otherwise this machine's existing `.local/postgres` installation, otherwise your PATH. Install PostgreSQL client tools matching the server version (or newer for `pg_dump`). No download or paid service is used. Credentials are passed through the child process environment, not command arguments.

Backups are custom-format dumps in ignored `.local/backups`. The command writes a restricted-permission partial file and renames it only after success; failed partial files are removed. Backups include private tenant data and password hashes. Protect this directory and copy backups to a separately protected destination for protection against disk loss.

Database dumps do not include uploaded images. Stop application writes while taking a dump and a protected copy of the matching `BARBER_UPLOAD_ROOT` (default `.local/uploads`). Retain and restore both together. See [local media](media.md) for consent withdrawal, cleanup and backup-retention limitations.

### Verify a backup without replacing your database

Use the exact path printed by the backup command:

```sh
npm run db:verify-backup -- /absolute/path/to/backup.dump --local
```

Omit `--local` for Compose. Verification creates a randomly named temporary database on the selected server, restores the dump transactionally, checks that migration history matches this checkout, checks booking-overlap and tenant foreign-key constraints, and reads aggregate record counts. It then removes its temporary database, including after a failed restore. The configured application database is not replaced. The database user needs `CREATEDB` privileges. Only verify trusted backups: PostgreSQL archives can contain executable SQL. If the process is forcibly terminated or cleanup fails, remove the reported `barber_restore_check_*` database manually after confirming it is a temporary verification database.

An older backup fails the migration-version check if it predates this checkout. Use its matching application version or test migrations on a restored copy before deploying it. Passing this check verifies the database archive and selected constraints; it does not verify uploaded-image files or the full application behavior.

### Replace the application database

Stop application traffic and explicitly select a trusted dump:

```sh
npm run db:restore -- /absolute/path/to/backup.dump --confirm-replace --local
```

Omit `--local` for Compose. Restore replaces matching objects in the selected database and runs as one transaction. The confirmation flag is required. This is destructive; use the verification command for routine restore drills.

On November 10, a backup and isolated restore check passed on this machine's PostgreSQL 16.15 database: 18 migrations, booking-overlap protection and the appointment/barber tenant relation were preserved. The temporary database was removed. A separate native round-trip test also restored saved fixture data after changing it, using its own temporary database. Run `npm run test:backup` for the four safety tests and `npm run test:backup:database` for that local database round-trip test. Docker Compose PostgreSQL 17 and image-file restoration remain unverified.

For daily backups, configure your OS scheduler to run `npm run db:backup -- --local` (or the Compose variant) from this project directory with Node and PostgreSQL tools available. Keep a private failure log and ensure the database is running. No scheduler or automatic retention/deletion policy has been installed. Production backup storage and scheduling remain deployment work.

## PWA packaging

The Business App has a manifest and a root-scoped offline-notice worker for the current separate-port setup. Each published client shop has a manifest and worker scoped to its own slug, with `/book` as the installed start page. The workers use network-only navigation and return a bilingual offline notice when disconnected. They do not cache client records, authenticated pages, API responses or booking requests, and do not queue offline writes.

PNG app icons are generated from the repository's SVG source by `node scripts/generate-app-icons.mjs`, using the Sharp package already installed with Next.js. Browser installation and platform-specific behavior have not been verified. Service-worker/asset scopes must be adapted when the single-domain gateway is selected; no gateway or production hosting is installed by these changes.
