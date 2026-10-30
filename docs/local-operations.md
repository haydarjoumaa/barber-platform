# Local operations and installable apps

## Environment and migrations

The apps remain independently runnable on ports 3001 and 3002. Copy each app's `.env.example` to its ignored `.env.local`, and configure the same local PostgreSQL database. Keep each app's `APP_ORIGIN` equal to its actual browser origin. Root `.env` is used by Prisma and operator scripts. Do not commit real connection strings.

After starting the local database, apply migrations:

```sh
npm run db:deploy
npm run db:generate
npm run dev
```

The new migrations have been written, but have not been applied to the offline development database. Prisma client generation was performed as a required code-generation step. No tests, lint, type checks, builds, migration execution or browser checks were run after the user requested that testing stop.

## Backups

The following command uses the Compose PostgreSQL container's `pg_dump` and writes a custom-format dump under ignored `.local/backups`:

```sh
npm run db:backup
```

It writes a restricted-permission partial file first and renames it only after successful completion. Backups include private tenant data and credentials stored in the database; keep them outside source control and protect the backup directory. Copy backups to a separately protected destination if protection against disk loss is needed.

Database dumps do not include uploaded images. Stop application writes while taking a dump and a protected copy of the matching `BARBER_UPLOAD_ROOT` (default `.local/uploads`). Retain and restore both together. See [local media](media.md) for consent withdrawal, cleanup and backup-retention limitations.

To restore, stop application traffic and explicitly select a dump:

```sh
npm run db:restore -- /absolute/path/to/backup.dump --confirm-replace
```

Restore replaces matching objects in the configured local Compose database and runs as one transaction. The confirmation flag is required. No backup or restore has been executed here. Use an OS scheduler for daily local backups when the machine and database are available; no scheduler has been silently installed. Production backup hosting and restore verification remain open.

## PWA packaging

The Business App has a manifest and a root-scoped offline-notice worker for the current separate-port setup. Each published client shop has a manifest and worker scoped to its own slug, with `/book` as the installed start page. The workers use network-only navigation and return a bilingual offline notice when disconnected. They do not cache client records, authenticated pages, API responses or booking requests, and do not queue offline writes.

PNG app icons are generated from the repository's SVG source by `node scripts/generate-app-icons.mjs`, using the Sharp package already installed with Next.js. Browser installation and platform-specific behavior have not been verified. Service-worker/asset scopes must be adapted when the single-domain gateway is selected; no gateway or production hosting is installed by these changes.
