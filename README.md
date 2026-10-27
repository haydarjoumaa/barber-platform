# Barber Platform

A local-first foundation for a multi-tenant barbershop booking platform. Product requirements live in [AGENTS.md](AGENTS.md). The project provides bilingual application layouts and a database foundation; accounts and bookings are not yet available.

## Requirements

- Node.js 22 LTS (22.12+) and npm. `.nvmrc` selects Node 22.
- Docker Engine/Desktop with Docker Compose, or a local PostgreSQL 17 installation.
- Internet for the initial open-source package/image downloads. No paid API keys or hosting are needed. Use Docker Engine or another free compatible runtime where Docker Desktop licensing is not appropriate.

## Local setup

Run commands from the repository root on Linux, macOS or Windows (PowerShell/WSL).

1. Install dependencies: `npm ci`.
2. Copy `.env.example` to `.env` (`cp .env.example .env`, or `Copy-Item .env.example .env` in PowerShell). Replace the placeholder password in both `POSTGRES_PASSWORD` and `DATABASE_URL`. URL-encode special characters in the connection URL. Never commit `.env`.
3. Start PostgreSQL: `docker compose up -d --wait db`.
4. Generate Prisma Client: `npm run db:generate`.
5. Apply checked-in migrations: `npm run db:deploy`.
6. Start both applications: `npm run dev`.

Visit the Business App at http://localhost:3001 and Client App at http://localhost:3002. The liveness endpoint is http://localhost:3001/api/v1/health; it does not test database connectivity. App shells can run without PostgreSQL. Root `.env` is loaded by Prisma CLI and database tests; Next.js uses app-local environment files. When database-backed routes are introduced, configure their server process environment explicitly or use a gitignored `apps/business/.env.local`. Never prefix database credentials with `NEXT_PUBLIC_`.

`docker compose stop` preserves the database. `docker compose down` also preserves its named volume. Removing volumes destroys local data. The database is bound to localhost only; development servers also bind to localhost.

If port 5432 is already occupied, change the host-side Compose port and the port in `DATABASE_URL`. If Docker reports socket permission errors, configure your local Docker installation/access or use a local PostgreSQL instance; do not loosen the socket's filesystem permissions. Tests require a migrated development database and remove only their uniquely identified fixtures.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run both apps |
| `npm run dev -w @barber/business` | Run only the Business App |
| `npm run dev -w @barber/client` | Run only the Client App |
| `npm run check` | Lint, typecheck, unit tests and production builds |
| `npm run test:database` | PostgreSQL tenant constraint integration test (requires `.env`, migration and database) |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:migrate -- --name descriptive_name` | Create/apply a development migration |
| `npm run db:deploy` | Apply existing migrations |
| `npm run db:studio` | Inspect local development records |

Production builds use webpack for a predictable workspace build; local development uses Next.js's default bundler. Prisma Client is generated rather than committed. `npm run build` and `npm run typecheck` generate it automatically. Use `npm ci` with the committed lockfile for reproducibility.

## Structure

```text
apps/business       Staff application and shared API host
apps/client         Shop-specific client application
packages/database   Prisma schema, migrations, server-only connection
packages/auth       Server authorization boundaries; sessions not yet implemented
packages/shared     Contracts, slug validation and localization utilities
packages/ui         Shared UI and styles
tests               PostgreSQL integration tests
docs                Routing proposal and implementation roadmap
```

See [the routing proposal](docs/routing.md) before adding public URL routing. `/business`, `/admin` and `/{shopSlug}` are intended public paths, not routes already implemented here. See [implementation status](docs/implementation.md) for the next increments and explicit gaps, including race-safe bookings, full auth, Arabic translation and installable PWA support.

Framework setup follows the official [Next.js installation documentation](https://nextjs.org/docs/app/getting-started/installation) and [Prisma 7 migration/configuration guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

## Preview without a database

Run `npm run dev` and open either application. Both layouts work without `.env` or PostgreSQL. In Business, select a section from the navigation or an overview card. Editing and booking buttons are intentionally disabled, with an explanation; no data is saved and no sample records are presented as real records.

Use the language selector to switch between English and Arabic. The document language, direction, screen text and offline banner update together. A non-sensitive `barber-locale` cookie remembers the preference for one year. The apps share this preference on the same hostname (including localhost across ports). Reload to pick up a language change made in another tab. If cookies are blocked, switching still works for the current page but persistence is not guaranteed. Server-rendered layouts read the cookie, so they render dynamically without requiring a database. See the official [Next.js cookies documentation](https://nextjs.org/docs/app/api-reference/functions/cookies).

Manual UI verification: check both languages at desktop and 375px phone width; navigate every Business section; expand Client FAQs; reload after switching language; and toggle browser offline mode after loading to check the localized notice. Public routing remains a proposal, and these previews are not authenticated workspaces.

## Availability foundation

The shared package now calculates availability from trusted service/barber records and explicit UTC candidate slots, without a database. It handles multi-service durations, barber overrides, occupied buffers, working intervals and blockers. Run `npm test` for its regression cases. Read [availability boundaries](docs/availability.md) before connecting it to an API: policy enforcement, persisted schedule integration and race-safe database reservations are still required.

The [local scheduling layer](docs/scheduling.md) now expands weekly hours, overrides, breaks, overnight shifts, time off and closure dates into UTC. It handles Beirut DST explicitly and composes with the availability engine. Schedule editing and database persistence are still pending.
