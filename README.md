# Barber Platform

A local-first, multi-tenant barbershop booking MVP with separate Business and Client applications, PostgreSQL, English/Arabic and RTL. Payments happen in the shop; WhatsApp links are sent manually. No paid services are required for local development.

## Run on this machine

The local database and both applications were started during the November 9 verification pass. Open **http://localhost:3001/login** for platform administration. Only the platform administrator creates shops and their owner accounts. Shop staff sign in at **http://localhost:3001/<shop-slug>/login**; customers book at **http://localhost:3002/<shop-slug>** after publication.

After restarting this machine:

```sh
nvm install 22
nvm use 22
bash .local/start-database.sh
npm run db:generate
npm run db:deploy
npm run dev
```

The `.local` PostgreSQL installation is specific to this machine, retains existing data and listens on port 55440. Use the portable setup below on a new machine. Use `localhost` in your browser to match the configured action origins.

## Portable local setup

Requirements: Node.js 22.12+ and npm; Docker Engine/Desktop with Compose, or your own local PostgreSQL installation. Package/image downloads need an internet connection. Use a free Docker-compatible runtime appropriate to your environment.

```sh
npm ci
npm run setup
docker compose up -d --wait db
npm run db:generate
npm run db:deploy
npm run dev
```

`npm run setup` creates a random local database password and gitignored environment files for **both apps**, without replacing existing configuration. If using an existing PostgreSQL instance, configure root `.env` first; setup copies that connection into missing app configurations. Existing app files are preserved and mismatched database connections are reported.

The Compose default is PostgreSQL 17 on `127.0.0.1:5432`. If changing its port, update `compose.yaml` and the connection in all three environment files. Never use `prisma db push`: checked-in migrations install the tenant and overlap constraints. `docker compose stop` and `docker compose down` preserve the named database volume; deleting volumes destroys data.

## First administrator and shop

Create your platform administrator once from the repository root:

```sh
npm run admin:create -- your-email@example.com
```

The terminal asks for a hidden password and confirmation. If the email already belongs to your existing staff account, use `npm run admin:grant -- your-email@example.com` instead; this preserves its password. See [administrator setup](docs/platform-administration.md).

1. Sign in at `http://localhost:3001/login`, create the shop and owner account in `/admin`, then give the owner their `/<shop-slug>/login` link and initial credentials. The owner signs in there to complete setup.
2. Save the shop phone and address under **Contact details and appearance**.
3. Add services with prices and durations.
4. Add your barber profile, expand **Supported services**, enable services, then save working hours under **Working hours and time off**.
5. Save booking policies: slot interval, notice, buffer, cancellation/rescheduling deadlines and approval mode.
6. Complete the publication checklist and select **Publish booking page**.
7. Share the client link. Clients can register with phone/password or book as guests. Staff can also register clients, book appointments, handle walk-ins and enable the queue.

The workspace supports day/week/month calendars, confirmation, cancellation, rescheduling, completed/no-show outcomes, in-shop receipts and reports. Invite barbers or receptionists from **Team** and grant appointment/schedule permissions. Client accounts include upcoming/history views, profile editing, recovery through the owner and consent-controlled photos. Platform administration requires an explicit local operator grant; see its guide below.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run setup` | Create missing private local environment files |
| `npm run dev` | Run both apps on ports 3001 and 3002 |
| `npm run check` | Lint, typecheck, unit tests and both production builds |
| `npm run test:database` | Run PostgreSQL integration tests against a migrated local database |
| `npm run test:browser` | Run Chromium onboarding, publication, booking, payment, rescheduling, cancellation and Arabic/mobile checks |
| `npm run build` / `npm start` | Build / serve both apps in production mode locally |
| `npm run db:deploy` | Apply checked-in migrations |
| `npm run db:backup` | Back up Compose; add `-- --local` for native PostgreSQL |
| `npm run db:verify-backup -- /path/to/backup.dump --local` | Test a native backup in a temporary database |

Before the first browser test, install Chromium with `npx playwright install chromium` and start the database. The browser runner checks each app independently, reuses running apps and starts either missing app. `PLAYWRIGHT_CHROMIUM_PATH` optionally selects an already installed Chromium executable. Browser tests create unique `browser-*` shops in the local database and retain them for inspection. Browser traces/screenshots stay in ignored `test-results/` and can contain test-account details.

Database tests use uniquely identified fixtures or temporary schemas, requiring schema-creation permission. They do not reset existing shops. Run them against development databases only.

The November 9 pass resumed verification, applied every pending migration, fixed the walk-in insert failure, and configured both apps. See [verification and remaining scope](docs/implementation.md) for exact coverage and limitations. Local verification is not a production-readiness claim.

## Structure and feature guides

```text
apps/business       Owner/staff workspace and platform administration
apps/client         Shop-specific storefront and client accounts
packages/database   Prisma, migrations and shared server-side domain operations
packages/auth       Sessions, permissions and password handling
packages/shared     Contracts, availability, timezone logic and translations
packages/ui         Shared components and styles
packages/storage    Private local image storage abstraction
tests               Database and browser regression checks
```

- [Agreed requirements](AGENTS.md), [routing](docs/routing.md), [local operations](docs/local-operations.md)
- [Publication](docs/publication.md), [client accounts](docs/client-access.md), [staff team](docs/staff-team.md)
- [Scheduling](docs/scheduling.md), [availability](docs/availability.md), [rescheduling](docs/rescheduling.md), [walk-ins](docs/walk-ins.md)
- [Payments and reports](docs/payments.md), [manual WhatsApp messages](docs/manual-messages.md), [photos and logos](docs/media.md)
- [Platform administration](docs/platform-administration.md)

Single-domain `/business` and `/{shopSlug}` routing remains deferred; local apps run separately. Online billing, automated messaging, loyalty, multi-branch support and advanced analytics are outside the current MVP scope.
