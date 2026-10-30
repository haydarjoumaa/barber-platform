# Implementation status

This is an implementation handoff, not a production-readiness claim. The user requested that testing stop. No tests, lint, type checks, builds, browser checks or database verification have been run for the latest implementation pass. Earlier results (281 unit tests and both builds passing) predate these changes and do not validate them. Prisma client and app-icon generation were run to create required artifacts.

## Implemented in code

- Two independent Next.js/TypeScript/Tailwind apps with shared UI, authentication, database and domain packages; PostgreSQL/Prisma and local Compose setup.
- Tenant-safe relations and database-level exclusion constraints for appointment overlap, shared schedule/availability calculations, Beirut timezone/DST handling and the 30-calendar-day booking horizon.
- Owner registration, staff email/password login, opaque sessions, origin validation, password hashing, attempt limits and audit events.
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
- Local shop logos and private client profile/haircut galleries, consent records, bounded image decoding/re-encoding, shared filesystem storage abstraction and operator cleanup command. Only published shop logos are public.
- Local Compose backup/explicit restore scripts. No backup schedule or restore was executed.

## Written migrations, not applied here

1. `20261030000100_in_shop_payments`: receipt ledger and one-active-receipt constraint.
2. `20261030000200_client_sessions`: birthdays, client sessions, reset codes and client security events.
3. `20261030000300_shop_details`: phone, address, description and accent color.
4. `20261030000400_staff_invitations`: invitations and appointment/schedule permissions, disabled by default for existing non-owner memberships.
5. `20261030000500_platform_admin`: platform roles/audit events and shop suspension.
6. `20261030000600_local_media`: tenant-scoped images, consent metadata and active logo/profile uniqueness.

The configured database was offline before the no-testing instruction. No further database connection attempts were made after that instruction. Apply all migrations once the local database is running; do not substitute `prisma db push`, which cannot install the custom SQL constraints.

## Decisions currently awaiting the user

- Rescheduling: preserve original service prices/durations/buffer, or apply current catalog values? The shared occupancy loader already supports excluding the appointment being moved, but no reschedule mutation/UI is connected.
- Publication: the proposed required fields are name, unique slug, phone, address, timezone, currency, active services and at least one configured/scheduled barber. Booking policy configuration must also be present for public availability. The publishing workflow is not enabled until the requirements are confirmed.
- Routing: local reverse proxy for `/business`, `/admin` and shop slugs, or separate ports for now? Apps remain on 3001/3002. Gateway cookie, asset and service-worker scopes have not been wired.

## Still unfinished

- Guided onboarding and publication; rescheduling; selected single-domain gateway/shared HTTP API deployment arrangement.
- Staff password recovery, staff membership removal and broader owner-assigned capabilities beyond appointment/schedule management.
- Public shop photo galleries and editable phone/account identity changes.
- Walk-in-specific policy overrides/optional queue, shop deletion with 30-day recovery/purge and retention policy handling.
- Platform feature flags/settings and future plan controls; paid billing is deliberately not a launch prerequisite.
- Private-beta verification, production hardening/deployment and actual backup scheduling/restore verification. These are not claimed complete.

Advanced customization, multi-branch support, loyalty, automated messaging and advanced analytics remain deferred under AGENTS.md.

## Feature notes

- [Client access and booking](client-access.md)
- [Staff invitations and permissions](staff-team.md)
- [Payments and basic reports](payments.md)
- [Platform administration](platform-administration.md)
- [Local logos and client photos](media.md)
- [Local operations and PWA packaging](local-operations.md)
- [Shop profile](shop-profile.md), [client profiles](client-profiles.md), [manual messages](manual-messages.md)
- [Availability](availability.md), [scheduling](scheduling.md), [reservation constraints](reservations.md)
