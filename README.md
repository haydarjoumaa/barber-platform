# Barber Platform

A local-first foundation for a multi-tenant barbershop booking platform. Product requirements live in [AGENTS.md](AGENTS.md). The project provides bilingual application layouts and a database foundation; owners can register clients, find available slots, save appointments and view saved bookings by date in the authenticated Business App.

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

Visit the Business App at http://localhost:3001 and Client App at http://localhost:3002. The liveness endpoint is http://localhost:3001/api/v1/health; it does not test database connectivity. App shells can run without PostgreSQL. Root `.env` is loaded by Prisma CLI and database tests; Next.js uses app-local environment files. For staff account routes, configure `DATABASE_URL` and `APP_ORIGIN=http://localhost:3001` in a gitignored `apps/business/.env.local`; see [staff account setup](docs/staff-accounts.md). Never prefix database credentials with `NEXT_PUBLIC_`.

`docker compose stop` preserves the database. `docker compose down` also preserves its named volume. Removing volumes destroys local data. The database is bound to localhost only; development servers also bind to localhost.

If port 5432 is already occupied, change the host-side Compose port and the port in `DATABASE_URL`. If Docker reports socket permission errors, configure your local Docker installation/access or use a local PostgreSQL instance; do not loosen the socket's filesystem permissions. Tests require a migrated development database and remove only their uniquely identified fixtures.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run both apps |
| `npm run dev -w @barber/business` | Run only the Business App |
| `npm run dev -w @barber/client` | Run only the Client App |
| `npm run check` | Lint, typecheck, unit tests and production builds |
| `npm run test:database` | PostgreSQL tenant, catalog/RBAC, appointment constraint and concurrent-writer tests (requires migrated database and `DATABASE_URL` in environment or `.env`) |
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
packages/auth       Authorization boundaries and password hashing
packages/shared     Contracts, slug validation and localization utilities
packages/ui         Shared UI and styles
tests               PostgreSQL integration tests
docs                Routing proposal and implementation roadmap
```

See [the routing proposal](docs/routing.md) before adding public URL routing. `/business`, `/admin` and `/{shopSlug}` are intended public paths, not routes already implemented here. See [implementation status](docs/implementation.md) for the next increments and explicit gaps, including race-safe bookings, full auth, Arabic translation and installable PWA support.

Framework setup follows the official [Next.js installation documentation](https://nextjs.org/docs/app/getting-started/installation) and [Prisma 7 migration/configuration guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

## Working owner booking flow

Open http://localhost:3001. The root now opens the authenticated workspace (or login), replacing the old nonfunctional visual preview. Register an owner account, then:

1. Create a service with a price and duration.
2. Create a barber profile for your owner membership, enable the service and save working hours under **Working hours and time off**.
3. Save the booking policies, including automatic confirmation or manual approval.
4. Register a client using a name and an explicit international phone number, such as `+96170123456`. This creates a shop client profile, not login credentials.
5. Select services, date and a specific or any available barber; click **Check availability**.
6. Choose an existing client, **New client — register and book**, or **Guest — booking only**; then select a returned slot and click **Book selected slot**. New clients need a name and international phone number; guests need a name and may provide a phone number. Availability, prices and duration are revalidated on the server.
7. The confirmation shows barber, services, time, price and status within the shop section. Click **View appointments** to see the saved appointment on its date. Reloading preserves it.

The daily appointment view includes records overlapping the shop-local date and uses saved service prices. Pending, confirmed, cancelled, completed and no-show states are displayed. Manual-approval bookings start Pending; owners can select **Confirm appointment** in the saved appointment list to approve them. Approval rechecks owner access, changes only pending bookings and records an audit event atomically. Reloading shows the confirmed status. Owners can also select **Cancel appointment**, review the confirmation, and explicitly override the cancellation deadline if needed. Cancellation preserves history, releases the slot and records any deadline override. Owners can record **Completed** or **No-show** from pending/confirmed appointments using the outcome controls and confirmation step. These outcomes preserve occupied time and do not record payment. Select **Day**, **Week** or **Month** above the saved appointments to browse the live calendar. Week/month cards link to the daily appointment controls, and date/view selections persist in the URL. Outcome corrections and rescheduling remain future work. No client-facing online booking is published yet.

The workspace requires a configured, migrated PostgreSQL database. English/Arabic controls and RTL are supported. Both languages were checked in Chromium, including a 375px viewport. The offline banner reports loss of connection; offline booking is not supported.

Local verification on October 29, 2026: a Chromium session registered an owner, configured service/barber/schedule/policies, registered a client, booked a slot and verified the saved appointment after reload. The database suite passed on PostgreSQL 16.15; PostgreSQL 17 Compose verification remains pending.

## Availability foundation

The shared package now calculates availability from trusted service/barber records and explicit UTC candidate slots, without a database. It handles multi-service durations, barber overrides, occupied buffers, working intervals and blockers. Run `npm test` for its regression cases. Read [availability boundaries](docs/availability.md) before connecting it to an API: owner availability now integrates stored schedules, occupied appointment buffers, minimum notice and the 30-day horizon; the owner booking repository revalidates these rules transactionally before saving.

The [local scheduling layer](docs/scheduling.md) now expands weekly hours, overrides, breaks, overnight shifts, time off and closure dates into UTC. It handles Beirut DST explicitly and composes with the availability engine. Owners can now save weekly working periods, breaks and dated time off, and preview a local date in `/workspace`. Apply the new schedule migration with `npm run db:deploy` first. Date-specific replacements and whole-shop closure dates are also supported; apply all migrations before opening the workspace. An owner-only availability check now combines saved schedules, policies and appointment occupancy. Public booking remains pending.

The [password storage foundation](docs/passwords.md) provides server-only hashing and verification using Node's built-in scrypt. Its tests run with `npm test` without PostgreSQL. Staff registration, login and sessions use these primitives; client accounts and recovery remain pending.

The [appointment reservation foundation](docs/reservations.md) adds a PostgreSQL exclusion constraint protecting each barber's occupied time, including buffers. Apply migrations before running `npm run test:database`, which exercises tenant boundaries, status changes and actual concurrent writers. Ordered service/price snapshot storage preserves historical values across catalog edits; apply all migrations before testing. An owner-only repository now revalidates availability and atomically saves an existing-client, new-client or guest booking, service snapshots and audit event. The authenticated owner booking form calls this repository; the public client API remains pending. Use migrations rather than `prisma db push`: the Prisma schema alone cannot install the custom overlap constraint.

The [persistent service catalog](docs/catalog.md) adds owner-only server operations for services, barber overrides and explicit shop currency, with database permission rechecks and transactional audit records. `npm run test:database` also exercises catalog tenant isolation, RBAC and composition with availability. Owners can create, edit and archive services in the authenticated `/workspace`. Owners can also create barber profiles for existing shop members, rename profiles, and manage service assignments and overrides. New staff invitations and public API routes remain pending; saved weekly schedules and time off are described above.

## Staff accounts

The Business App has bilingual `/register`, `/login` and protected `/workspace` screens. Configure the database and app origin using [staff account setup](docs/staff-accounts.md). Shops remain unpublished and onboarding is pending. The account integration suite runs with `npm run test:database` in an isolated temporary schema, requiring schema-creation permission.

Guest and quick-booking require the latest additive migration: run `npm run db:deploy`. Quick-booking creates a shop client profile and appointment atomically, without login credentials. Existing phone numbers must be selected through the existing-client option. Guest details are stored only on the appointment and shown in the saved calendar. `npm run test:booking-smoke` runs the focused integrity check; broader regression and browser checks are deferred during feature-focused development.
