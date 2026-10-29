# Barber Platform — Codex Project Context

## Purpose
Build a multi-tenant barbershop booking SaaS. This document is the agreed product context and implementation guidance. Follow it when planning or coding; do not silently change product decisions. Ask when an unresolved choice materially affects implementation.

## Repository and applications
- One GitHub monorepo: `barber-platform`.
- Two separate user-facing applications: **Business App** (owners, barbers, receptionists, platform admin) and **Client App** (shop-specific booking and client account).
- Shared backend/API and PostgreSQL database; shared libraries for auth, database, types and UI. Separate deployment of apps should remain possible.
- Proposed layout: `apps/business`, `apps/client`, `packages/database`, `packages/auth`, `packages/shared`, `packages/ui`. Adapt if justified, keeping two apps.
- Proposed paths on one domain: `/business` for staff, `/{shopSlug}` for each shop's client booking site, `/admin` for platform administration. Reserve system routes and reject slug collisions. These are intended public URLs; routing/deployment mechanics remain to be designed.
- Example: `barberapp.com/royal-barber` and `barberapp.com/fade-cut` are different tenant storefronts in the same client application.

## Core tenancy and registration
- One platform serves many independent barbershops. Do not create separate deployments/databases per shop.
- Each barbershop has a unique, editable URL slug (suggested from name, validated for uniqueness and reserved paths).
- Owner self-registers, account activates immediately, guided setup wizard; shop booking page only publishes after mandatory profile fields are complete.
- Owner can edit shop name, logo, colors, photos, description, contact info, social links, services, prices, hours and configurable page sections/templates.
- No public shop directory/search or cross-shop discovery in MVP. Clients arrive using a particular shop's link.
- Clients are shop-specific: one client account per shop, and the same phone may register at different shops but not twice in one shop. Do not create cross-shop client access by default.
- Initially one location per barbershop; multi-branch support may become a premium feature later.

## Roles and permissions
- **Owner:** full shop access; can optionally also have a separate barber profile and take bookings.
- **Barber:** manages own schedule/appointments within permissions.
- **Receptionist/admin (optional):** can manage appointments and schedules across barbers, subject to owner-assigned permissions.
- **Platform administrator:** manages shops, future subscriptions, feature flags, global settings, platform metrics and suspensions. Support access to shop data is read-only and audited.
- Keep authentication identity, shop membership/role and barber profile distinct in the data model. Enforce authorization on the server, not only in UI.
- Staff may be created by owner or invited via link.

## Client identity and dashboard
- Client registration: name, phone, optional email, birthday and photo. Client may self-register or be registered by staff; guest bookings also supported.
- Client login: **phone number + password**, not paid WhatsApp/SMS OTP.
- Forgot-password recovery via authorized shop staff with identity verification; never expose passwords to staff. Use secure reset procedures.
- MVP client dashboard: upcoming appointments, appointment history, cancellation/rescheduling, profile and new booking.
- Loyalty/favorites are future features unless explicitly reprioritized.

## Booking workflow
- Staff can book for existing clients, register new clients, create guest appointments, or quick-book with name + phone.
- Support walk-ins and optional waiting queue.
- Client can select multiple services in one appointment; all performed by the same barber. Sum durations and prices; apply any configured buffer.
- Shop has default service list; individual barbers may override supported services, price and duration.
- Client chooses a specific barber or **any available**. Filter barbers and slots by selected services, schedule, breaks, time off, closures, appointment duration and existing bookings.
- Barber schedules support working days/hours, breaks, vacation, days off and temporary changes. Shop supports closure dates.
- Never allow overlapping appointments for one barber, including staff-created bookings. Enforce transactionally at database level to prevent race conditions (e.g., PostgreSQL exclusion constraint or equivalent robust locking strategy).
- Show alternative slots/dates if none are available.
- Shop-configurable automatic vs manual approval.
- Appointment statuses: Pending, Confirmed, Cancelled, Completed, No-show (staff-managed).
- Daily/weekly/monthly calendar in MVP; drag-and-drop and barber-column enhancements can be deferred/premium.
- Max booking horizon: **30 calendar days ahead at the same shop-local time**, including across daylight-saving changes. No fixed cap on how many appointments a client may hold.
- Each shop chooses its booking slot interval.
- Shop-configurable minimum advance notice, cancellation deadline and rescheduling deadline; authorized staff can override policies.
- Confirmation shows shop, barber, services, date/time, total price and status.
- Shop closure changes affecting existing bookings require manual handling initially.

## Payments and shop operations
- Haircut/service payments occur **in shop**, not through client online checkout.
- Staff record paid/unpaid status and revenue.
- Client profiles can include notes, preferences, haircut photos with consent, preferred barber, history and payments.
- Reporting goals: revenue by barber, popular services, cancellations, busiest hours, retention, performance and custom date ranges. Phase advanced analytics if needed.

## Notifications and zero-cost constraints
- **Critical constraint: $0 development cost** and no paid external APIs or paid hosting during initial local development.
- WhatsApp messages are **manual click-to-chat links**, initiated and sent by staff. Do not implement automated WhatsApp messages, paid WhatsApp API or WhatsApp OTP in MVP.
- Future automated confirmations/reminders can be designed as optional integrations but not assumed available for free.
- Develop locally first; evaluate free-tier hosting only when private beta approaches. Do not claim production hosting is permanently free.
- Use free/open-source dependencies where possible.

## Technical direction
- Next.js + TypeScript + Tailwind CSS for both apps.
- Next.js server/API routes for backend; shared API contract between apps.
- PostgreSQL + Prisma ORM proposed.
- Auth.js proposed, with custom secure phone/password credential flow as required.
- Docker Compose for local cross-platform development (Windows, macOS, Linux).
- Local image storage during development; design storage abstraction for future cloud deployment.
- Free/open-source calendar component.
- PWA installable on phone, tablet and desktop. Internet required; display a clear offline state.
- English and Arabic, including RTL support.
- Initial operating timezone `Asia/Beirut` with daylight-saving rules; store appointment instants in UTC and render in shop-local time. Preserve correct timezone behavior across DST transitions.

## Suggested data domains
- Platform: `barbershops`, `platform_admins`, `plans`, `subscriptions`.
- Identity: `users`, `shop_memberships`, `client_accounts`.
- Staff: `barbers`, `barber_schedules`, `barber_time_off`.
- Services: `services`, `barber_services`.
- Bookings: `appointments`, `appointment_services`, `shop_closures`, `walkin_queue`.
- Operations: `clients`, `client_photos`, `payments`; future `loyalty_accounts`.
- Add `barbershop_id` to all tenant-owned records, scope every query, and use tenant-safe relations/composite keys or database policies to prevent cross-shop references.
- Never trust shop ID, role or price values supplied by a client without server-side validation.

## Lifecycle, security and administration
- Appointment history retained indefinitely by default, subject to privacy/deletion/legal obligations.
- Shop deletion: immediate deactivation, 30-day recovery period, then permanent deletion except required legal retention.
- Daily database backups planned, with restore testing; production backup approach depends on hosting.
- Security audit logs retained even though a staff activity-log UI is not part of MVP.
- Use password hashing, rate limiting, session security, least privilege, input validation and tenant isolation tests.
- Image uploads require file validation, access controls and consent handling.

## Subscription strategy
- Initial launch: **free for all shops, features unlocked**.
- Design for future Free/Basic/Premium plans, feature flags, quotas and premium multi-branch capabilities.
- Future behavior: upgrades immediately after payment; grace period before downgrade to free; downgrades preserve data but restrict use beyond limits. Manual/online subscription payment handling later.
- Do not build paid billing as a launch prerequisite.

## Rollout and priorities
- Start with private beta for invited shops, then public launch.
- Prioritize robust foundations: repo scaffolding, local environment, tenant model, auth/RBAC, shop onboarding, service/barber configuration, availability, race-safe booking, business calendar, client booking/dashboard.
- Keep MVP narrow where future features were identified: advanced UI customization, multi-branch, automated messaging, loyalty, premium calendar interactions, advanced analytics and billing.

## Codex working rules
1. Read this file before implementation and treat it as the source of agreed requirements.
2. Work in small, reviewable increments. Explain proposed changes before major architecture shifts.
3. Keep the two apps distinct while sharing contracts and domain logic; do not duplicate booking/business rules.
4. Add migrations, tests and clear local setup instructions for implemented features.
5. Test tenant isolation, RBAC, double-booking concurrency, duration-based availability and Beirut timezone/DST behavior.
6. Never commit credentials, `.env` secrets, user data or production tokens.
7. If a requirement is ambiguous, ask rather than inventing a product decision.

## First suggested Codex task
Scaffold the `barber-platform` monorepo with `apps/business` and `apps/client`, shared packages, TypeScript, Next.js, Tailwind, Prisma/PostgreSQL, Docker Compose, linting/testing and a README for zero-cost local development. Do not yet implement payment integrations, paid messaging or production deployment. Propose a clear approach for serving `/business` and `/{shopSlug}` before wiring routing.
