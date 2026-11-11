# Implementation status

The November 9 request to make the project runnable supersedes the earlier testing pause. Both applications now have matching local database configuration and run on ports 3001/3002. All 20 checked-in migrations are applied to this machine's existing PostgreSQL 16.15 database. PostgreSQL 17 Compose verification remains separate.

## November 10 backup and restore verification

- Added native local PostgreSQL backup/restore alongside the existing Compose mode. `--local` uses the configured loopback database, keeps credentials out of command arguments, and supports this machine's bundled PostgreSQL tools.
- Added `db:verify-backup`: restores into a new temporary database, checks migration history and critical booking/tenant constraints, reports aggregate counts, and removes the temporary database. It never replaces the application database.
- Added regression coverage for restore confirmation, connection targeting, private/atomic backup files, failed dump cleanup and temporary-database ownership/cleanup. These tests are included in `npm test`.
- Four backup safety tests, a native backup/restore round-trip regression test and targeted ESLint passed. A real PostgreSQL 16.15 backup and isolated restore passed with all 18 migrations and required constraints. The temporary database was removed. Native backup instructions now work without Docker. Compose PostgreSQL 17, uploaded-file restoration and automatic daily scheduling remain unverified or unconfigured.

## November 10 queue browser verification

- Extended the existing Chromium scenario with receptionist guest arrivals, arrival ordering, persistence after reload, owner-only queue toggles, and removal/renumbering while new arrivals are disabled.
- The browser runner now checks and starts each app independently, so an already-running Business App cannot hide a stopped Client App.
- Verified with Node.js 22.23.4 and the existing local PostgreSQL database: the extended browser scenario passed (including the prior booking flow), targeted ESLint passed, and root TypeScript checks passed. Both apps were initially stopped and were started by the runner. No application behavior or database schema changed in this increment.
- Walk-in serving remains covered by the PostgreSQL integration suite; this browser increment covers queue management without depending on the current shop opening hours.

## November 10: administrator-created shops

The platform administrator now creates shops and owner accounts from `/admin`. Public owner registration is disabled. `/login` is for platform administrators; `/{shopSlug}/login` requires active shop membership and creates a shop-scoped staff session. The shared `/workspace` renders only that shop. Customer booking and accounts remain scoped to the shop in the Client App. Owner provisioning never switches the administrator session or overwrites an existing account password.

Added `admin:create` with hidden terminal password entry for the first platform identity; `admin:grant` remains available for an existing selected identity. No personal administrator account was created automatically. Migration `20261110000100_scoped_staff_sessions` is applied locally (18 total). Existing shop staff must sign in again. No appointment or client data was changed.

Verification: 298 unit tests and 80 PostgreSQL tests passed; both production builds passed. The updated Chromium scenario passed administrator sign-in → shop/owner creation → separate owner login → setup/publication → client booking/payment/rescheduling/cancellation, plus staff invitations.

## November 9 runnable-MVP pass

Verified on this machine with Node.js 22.23.4 and PostgreSQL 16.15:

- `npm run check`: lint, all TypeScript checks, 296 unit tests and both production builds passed.
- `npm run test:database`: 78 tests passed, including actual concurrent reservation writers and tenant/DST checks.
- `npm run test:browser`: one extended Chromium scenario passed end to end, including logo upload/public delivery, owner onboarding, client booking/payment/rescheduling/cancellation, Arabic mobile layout, staff invitation acceptance and receptionist restrictions.
- `npm run setup`: verified against the existing configuration without replacing it.

The installed Node default was 20; checks used Node 22. Use `nvm install 22` and `nvm use 22` for future work. The dependency audit reports eight moderate development-tool findings through TypeScript ESLint's minimatch dependency; no forced framework downgrade was made. Compose PostgreSQL 17, production hosting, native PWA installation, daily backup scheduling and backup restore drills remain unverified.

- Fixed walk-in creation: the shared writer now selects persisted identity fields explicitly instead of spreading a display-only `clientName` into Prisma data.
- Fixed lint failures in invitation code initialization and server-provided calendar/queue clock snapshots; updated client-profile test mocks for the media/recovery components.
- Added client configuration, published-shop links, `npm run setup`, root `npm start`, reproducible Playwright configuration and end-to-end browser coverage.
- Added isolated PostgreSQL coverage for shop-specific client identity/session boundaries, booking/rebooking, saved-value rescheduling and manual approval, payment recording/correction, cancellation, password recovery, invitations, permission revocation, platform suspension, image consent/replacement/removal and private photo access.
- Removed outdated UI text claiming invitations and rescheduling were unavailable.
- Browser verification covers owner registration, contact details, service/barber setup, schedules, policies, publication, client registration/booking, persisted staff/client calendars, payments, rescheduling, cancellation and Arabic mobile layout.

This is a local MVP verification pass, not completion of every remaining roadmap feature or a production-readiness claim. The unfinished scope below remains explicit. Browser fixtures use unique `browser-*` slugs and are retained locally; database tests clean up their own fixtures or temporary schemas.

## Earlier November 9 queue increment (historical)

Finished a waiting-queue usability increment: staff can explicitly select the remaining active barber when a queued preference becomes unavailable, and serving is disabled when the catalog has no bookable barbers. Wait times now show completed minutes and update every 15 seconds using one shared clock with a server-provided initial value. This clock does not refresh queue data. Added an unexecuted database regression case for a disabled preference followed by explicit reassignment. Testing, lint, type checks, builds and database verification remain paused under the recorded user instruction.

## November 2 continuation (third pass)

Added staff walk-ins (earliest free minute from now, skipping notice/grid/approval but not occupancy) and an owner-switchable, staff-only shop waiting queue. Barbers with disabled shop access are now hidden from all new bookings. New migration `20261102000200_walk_ins` (not applied). New tests: `walk-ins.integration.ts`, `walk-in.test.ts`; none executed. See [walk-ins](walk-ins.md).

## November 2 continuation (second pass)

Added owner publication with a readiness checklist, server-side rechecks and audit events, and staff/client rescheduling that keeps saved values. Both are in English/Arabic. New tests: `shop-publication.integration.ts`, `reschedule.integration.ts`, `publication.test.ts`. None were executed, and no lint, typecheck or build was run. No new migration is needed.

## November 2 continuation

Added owner controls to disable/restore non-owner app access for a single shop, with English/Arabic confirmation UI, transactional audit records, permission clearing, active-membership session filtering and live authorization checks. Barber schedules and bookings remain in place. The new migration has not been applied. Regression tests were written but not executed; test execution, lint, typechecking, builds and database verification remain paused under the recorded user instruction. Prisma Client generation succeeded. See [staff access controls](staff-team.md#shop-access-controls).

## Implemented in code

- Two independent Next.js/TypeScript/Tailwind apps with shared UI, authentication, database and domain packages; PostgreSQL/Prisma and local Compose setup.
- Tenant-safe relations and database-level exclusion constraints for appointment overlap, shared schedule/availability calculations, Beirut timezone/DST handling and the 30-calendar-day booking horizon.
- Administrator-only shop/owner provisioning, shop-specific staff email/password login, opaque sessions, origin validation, password hashing, attempt limits and audit events.
- Owner shop name/slug editing with reserved routes, uniqueness and stale-edit detection; contact phone, address, description and accent color editing. Saving does not publish a shop.
- Service catalog, barber profiles and overrides, working periods/breaks, time off, dated schedule replacements and shop closures.
- Staff-created existing-client, quick new-client and guest appointments, saved service snapshots, pending approval, cancellation/deadline override, completed/no-show outcomes and audited outcome correction.
- Day/week/month calendars with client/phone/barber search and status filters; manual English/Arabic WhatsApp message previews and click-to-chat links.
- Owner client directory and paginated appointment histories. Staff-assisted setup/recovery codes are issued only after explicit identity verification.
- In-shop full-payment receipts, paid/unpaid status, audited receipt corrections, recorded revenue by barber/currency and custom date-range appointment counts. No online checkout or paid integration.
- Staff invitations with one-use, expiring hashed codes, invitation revocation, existing-identity password verification and separate barber/receptionist membership. Owners can grant appointment and schedule permissions separately. Staff workspaces enforce barber ownership or receptionist shop scope in database-backed authorization.
- Public shop-specific client routes, gated to active published shops. Phone/password registration and login, separate shop-bound cookies, one-time staff-assisted password setup/reset, session revocation, profile editing, upcoming/history views and policy-enforced cancellation.
- Public guest/account booking, multi-service selection and any/specific barber availability. Owner and client writes reuse the same server-only availability and snapshot-persistence code; transaction and exclusion protections remain in place.
- Separate platform-administrator role, explicit local operator bootstrap, paginated shop listing, audited suspension/reactivation and audited read-only support views. No automatic administrator grants.
- English/Arabic controls for the implemented flows, shared account styling and RTL-aware layout. PWA manifests/icons and network-only offline-notice workers for the current separate-port setup; no account/appointment caching or offline writes.
- Local shop logos and private client profile/haircut galleries, consent records, bounded image decoding/re-encoding, shared filesystem storage abstraction and operator cleanup command. Published shop logos and explicitly uploaded shop-gallery images are public.
- Local Compose/native backup and explicit restore scripts, plus an isolated database restore check verified on PostgreSQL 16.15. No backup schedule is installed.

## Previously pending migrations (now applied locally)

1. `20261030000100_in_shop_payments`: receipt ledger and one-active-receipt constraint.
2. `20261030000200_client_sessions`: birthdays, client sessions, reset codes and client security events.
3. `20261030000300_shop_details`: phone, address, description and accent color.
4. `20261030000400_staff_invitations`: invitations and appointment/schedule permissions, disabled by default for existing non-owner memberships.
5. `20261030000500_platform_admin`: platform roles/audit events and shop suspension.
6. `20261030000600_local_media`: tenant-scoped images, consent metadata and active logo/profile uniqueness.
7. `20261102000100_staff_access_controls`: reversible shop access disabling, cleared permissions and owner-protection constraint.
8. `20261102000200_walk_ins`: appointment walk-in flag, shop queue switch and tenant-safe `walkin_queue` table.

The configured database was restarted during the November 9 runnable-MVP pass. Only the two November 2 migrations were actually pending; both were applied successfully. The other six listed migrations were already recorded as applied. Do not substitute `prisma db push`, which cannot install the custom SQL constraints.

## Decisions recorded November 2, 2026

- The November 2 testing pause was superseded by the November 9 request to make the project runnable and verify working features.
- Rescheduling keeps the original saved services, prices, durations and buffer. See [rescheduling](rescheduling.md).
- Publication requires the proposed list: name, valid slug, phone, address, time zone, currency, an active service, a bookable barber and saved booking policies. See [publication](publication.md).
- Walk-ins start now (or the next free minute), skip notice, never overlap; the queue is per shop, staff-only and switchable. Disabled barbers are hidden from new bookings.
- Routing: keep separate ports (3001 business, 3002 client) for local development. The single-domain gateway is deferred until beta hosting is chosen.

## November 11: rescheduling to another barber

Staff and client rescheduling now allow eligible barber transfers while preserving saved services, prices, duration and buffer. Owners and authorized receptionists may transfer across the shop; barber-role staff remain limited to their own schedule. Transfers recheck service support, active membership, availability and stale barber/start values inside the existing transaction, with before/after barber audit records. No migration is required. See [rescheduling](rescheduling.md).

Verification: lint, TypeScript checks, 298 unit tests plus backup safety tests, all 80 PostgreSQL tests and both production builds passed. The added concurrent transfer test passed. The extended Chromium scenario passed a client barber transfer, slot-list invalidation on selection changes, persistence after reload and the updated staff calendar.

## November 11: public shop gallery and profile links

Owners can upload and remove public gallery photos with explicit publishing consent and optional descriptions. Gallery lists are paginated, separate from logos and private client images, and visible only for active published shops. Public image routes enforce the same gates and deny removed, private or cross-shop assets. Website, Instagram and Facebook links are editable with owner authorization, stale-edit protection and HTTPS/host validation. English/Arabic forms and storefront rendering are included. Two additive migrations are applied locally (20 total).

Verification: 298 unit tests plus backup safety tests, all 81 PostgreSQL tests, lint, TypeScript checks and both production builds passed. The extended gallery pagination test passed. Chromium verified two gallery uploads, unpublished-image denial, public rendering and social links, image withdrawal (404), and the existing booking/transfer/queue flows.

Next requested increment: platform settings, feature flags and future plan controls.

## Still unfinished

- Single-domain gateway/shared HTTP API deployment arrangement (deferred).
- Staff password recovery, full staff offboarding (including booking/schedule handling) and broader owner-assigned capabilities beyond appointment/schedule management.
- Editable client phone/account identity changes.
- Shop deletion with 30-day recovery/purge and retention policy handling.
- Platform feature flags/settings and future plan controls; paid billing is deliberately not a launch prerequisite.
- Private-beta verification, production hardening/deployment and actual backup scheduling, Compose restore and uploaded-file restore verification. These are not claimed complete.

Advanced customization, multi-branch support, loyalty, automated messaging and advanced analytics remain deferred under AGENTS.md.

## Feature notes

- [Publication](publication.md), [rescheduling](rescheduling.md), [walk-ins and queue](walk-ins.md)
- [Client access and booking](client-access.md)
- [Staff invitations and permissions](staff-team.md)
- [Payments and basic reports](payments.md)
- [Platform administration](platform-administration.md)
- [Local logos and client photos](media.md)
- [Local operations and PWA packaging](local-operations.md)
- [Shop profile](shop-profile.md), [client profiles](client-profiles.md), [manual messages](manual-messages.md)
- [Availability](availability.md), [scheduling](scheduling.md), [reservation constraints](reservations.md)
