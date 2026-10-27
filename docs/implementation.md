# Implementation status and next increments

The scaffold now includes bilingual application layouts. It is not yet a functional booking product.

Implemented:
- Two independent Next.js applications, TypeScript, Tailwind and shared UI.
- npm workspace packages for database, auth boundaries and shared contracts.
- PostgreSQL Compose service and a Prisma migration for shops, staff users, memberships, barber profiles, clients and client credentials.
- Composite tenant foreign keys, per-shop phone uniqueness and deny-by-default owner authorization helper.
- Slug validation, Beirut date formatting, locale direction helpers and an offline banner.
- Unit tests and a PostgreSQL integration test for cross-shop relationships.
- Pure shared availability calculations for explicit UTC candidate slots, combined service durations/prices, barber overrides, closures, buffers and tenant consistency checks. See [availability boundaries](availability.md).
- Shared local schedule expansion with weekly hours, date replacements, overnight shifts/breaks, time off, full-day closures and explicit Beirut DST error handling. See [scheduling](scheduling.md).
- Responsive Business App sections for overview, appointments, services, team and shop profile, with explicit unavailable-action states.
- Client landing page with shop-link guidance, booking explanation and expandable FAQs; no directory or cross-shop discovery.
- English/Arabic translations for current screens, language selection persisted in a non-sensitive cookie, server-rendered language/direction and a translated offline banner.

The auth package does not authenticate users or issue sessions. Its principal must eventually be built exclusively from verified server-side session data. No tenant-data API is exposed in this increment. The database wrapper is server-only, but does not automatically scope queries or implement row-level security; all future repositories must accept an authorized tenant context. Staff email exists as an identity field; the staff login method is not yet decided. Client phone normalization and password hashing must be added before any account creation endpoint. Password hash columns must never contain plaintext passwords.

Next, in reviewable increments:
1. Resolve staff login/recovery method, exact mandatory shop publication fields and gateway choice. Implement secure sessions, password hashing, rate limiting, RBAC, audit events and tenant-scoped repositories. Clients use phone + password and staff-assisted recovery as agreed.
2. Owner registration and onboarding, slug allocation, publication validation, barber/service management and English/Arabic UI. Owner accounts activate immediately; storefront publication waits for required fields.
3. Scheduling and availability, with duration/buffer calculation, Beirut DST disambiguation, closures, service overrides and the 30-day horizon.
4. Appointment migration with a PostgreSQL exclusion constraint on each barber's occupied time range, plus transactional booking and real concurrent-writer tests. Do not introduce any booking write endpoint before this constraint exists. Add availability and policy tests with that increment.
5. Business calendar, client booking/dashboard, cancellation/rescheduling, in-shop payment records and manual WhatsApp links.
6. PWA installation, scoped manifests and service workers, translations/RTL verification for future workflows, validated local uploads with consent and storage abstraction, backup/restore checks and private-beta hardening.

PWA installation, full Arabic localization, authentication, booking persistence, schedule persistence/editing, booking-policy enforcement, live availability APIs, billing and deployment are not implemented. The offline banner is available only after a page has loaded; offline launching is not yet supported. No production hosting or paid API is configured.
