# Implementation status and next increments

The scaffold now includes bilingual application layouts. It is not yet a functional booking product.

Implemented:
- Two independent Next.js applications, TypeScript, Tailwind and shared UI.
- npm workspace packages for database, auth boundaries and shared contracts.
- PostgreSQL Compose service and a Prisma migration for shops, staff users, memberships, barber profiles, clients and client credentials.
- Composite tenant foreign keys, per-shop phone uniqueness and deny-by-default owner authorization helper.
- Server-only password hashing/verification with versioned scrypt records and strict input bounds. See [password storage](passwords.md); authentication endpoints and sessions remain pending.
- Shared password-work capacity limit and login-oriented verification with equivalent hashing work for missing/malformed account records. Endpoint rate limiting remains pending.
- Appointment reservation schema and SQL migration with tenant-safe barber/client relations, interval checks and a PostgreSQL exclusion constraint. Real concurrent-writer integration tests are included; see [reservation boundaries](reservations.md). Booking workflows and service/price snapshots remain pending.
- Persistent service catalog, shop currency and barber-specific price/duration overrides. Owner-only server repositories recheck database permissions and append transactional audit events; active catalog records compose with availability. See [catalog boundaries](catalog.md). Editing forms and authenticated APIs remain pending.
- Slug validation, Beirut date formatting, locale direction helpers and an offline banner.
- Unit tests and a PostgreSQL integration test for cross-shop relationships.
- Pure shared availability calculations for explicit UTC candidate slots, combined service durations/prices, barber overrides, closures, buffers and tenant consistency checks. See [availability boundaries](availability.md).
- Shared local schedule expansion with weekly hours, date replacements, overnight shifts/breaks, time off, full-day closures and explicit Beirut DST error handling. See [scheduling](scheduling.md).
- Responsive Business App sections for overview, appointments, services, team and shop profile, with explicit unavailable-action states.
- Redesigned light/charcoal/blue interfaces and shared SVG icons. The appointment calendar supports day/week/month navigation and date selection with Beirut-local calendar dates; appointment data is not connected. See [interface boundaries](interface.md).
- Client landing page with shop-link guidance, booking explanation and expandable FAQs; no directory or cross-shop discovery.
- English/Arabic translations for current screens, language selection persisted in a non-sensitive cookie, server-rendered language/direction and a translated offline banner.

The auth package does not authenticate users or issue sessions. Its principal must eventually be built exclusively from verified server-side session data. No tenant-data API is exposed in this increment. The database wrapper is server-only, but does not automatically scope queries or implement row-level security; all future repositories must accept an authorized tenant context. Staff email exists as an identity field; the staff login method is not yet decided. Client phone normalization and integration of the password helpers must be added before any account creation endpoint. Password hash columns must never contain plaintext passwords.

Next, in reviewable increments:
1. Resolve staff login/recovery method, exact mandatory shop publication fields and gateway choice. Implement secure sessions, password hashing, rate limiting, RBAC, audit events and tenant-scoped repositories. Clients use phone + password and staff-assisted recovery as agreed.
2. Owner registration and onboarding, slug allocation, publication validation, barber/service management and English/Arabic UI. Owner accounts activate immediately; storefront publication waits for required fields.
3. Scheduling and availability, with duration/buffer calculation, Beirut DST disambiguation, closures, service overrides and the 30-day horizon.
4. Extend the reservation foundation with service/price snapshots and transactional booking. Install and verify the PostgreSQL exclusion constraint before introducing any booking write endpoint. Add server availability revalidation, policy enforcement and API-level concurrency tests with that increment.
5. Business calendar, client booking/dashboard, cancellation/rescheduling, in-shop payment records and manual WhatsApp links.
6. PWA installation, scoped manifests and service workers, translations/RTL verification for future workflows, validated local uploads with consent and storage abstraction, backup/restore checks and private-beta hardening.

PWA installation, full Arabic localization, authentication, complete booking workflows, schedule persistence/editing, booking-policy enforcement, live availability APIs, billing and deployment are not implemented. The offline banner is available only after a page has loaded; offline launching is not yet supported. No production hosting or paid API is configured.
