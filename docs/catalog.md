# Persistent service catalog

The database package now stores shop services and explicit barber/service assignments. Owner-only server operations create, update and archive services; set or remove barber assignments; configure the shop currency; and load the active catalog. The authenticated Business App workspace now connects service creation, editing and archiving through server actions. Barber profile creation/renaming and service assignment editing are also connected; public booking APIs remain pending.

## Server boundary

Import `createServiceCatalog` and `getDatabase` from `@barber/database`. The package entry is server-only. Every method requires a `StaffPrincipal` built from a verified session and a shop ID. Never construct that principal from request JSON or trust a request's role claim.

Each operation first checks the principal's owner membership, then rechecks the current database membership and shop deactivation status inside a transaction. The shop and membership rows are locked until completion using PostgreSQL [row-level locks](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS). This prevents a concurrent role revocation or shop deactivation from slipping between authorization and mutation. Catalog operations for a shop are serialized; these transactions must remain short. Future role/deactivation workflows must use consistent lock ordering.

All catalog queries scope tenant-owned records to the authorized shop. Composite foreign keys also prevent cross-shop barber/service assignments. This is an owner management repository, not a public booking catalog or a general authorization system. Platform support access is not provided by these methods.

Successful mutations append an `audit_events` record in the same transaction, with actor, shop, event type and relevant catalog values. Service updates include before/after values. The repository has no audit modification/deletion operation. Database role restrictions, broader security event coverage and shop deletion/retention workflows are still pending; the table alone is not a tamper-proof audit system.

## Prices and overrides

Existing shops have a null currency until explicitly configured. `setCurrency` accepts currency codes supported by the runtime's Intl currency data. No default currency or exchange rate is assumed. Service creation requires a configured currency; the server copies it from the shop rather than accepting it in service input. A composite foreign key ensures all service prices belong to that shop/currency pair. Currency changes are blocked while service records exist, including archived records, to prevent relabeling historical prices. A future currency-conversion workflow would need an explicit design.

Prices are integer minor units, including zero; durations are positive integer minutes. Storage uses PostgreSQL signed 32-bit integers. The UI displays prices in the shop currency and converts entered decimals exactly into minor units, using that currency’s precision. ASCII, Arabic-Indic and Persian digits are accepted, with a decimal point or Arabic decimal separator; grouping separators, negative amounts, excess precision and integer overflow are rejected. No checkout or payment integration is introduced.

A barber supports a service only when its assignment row exists. `setBarberService` replaces both override values: null means inherit the current shop service value, while zero is a valid price override. Removing an assignment removes support for future availability. Archiving a service preserves its record and assignments but excludes both from `list`. Changes do not alter existing appointments; appointment service/price snapshots remain to be added.

`list` returns the shop currency, active services and barbers with supported-service options. These service and barber records compose with the shared availability engine once authoritative working intervals and blockers are supplied. Persisted schedules, booking policies and transactional booking revalidation are still required.

## Verification

Run `npm run db:generate`, `npm run db:deploy` and `npm run test:database` against a local development database. The tests verify owner RBAC, stale/forged role claims, deactivated shops, cross-shop references and mutations, explicit currency, input validation, audit records, archive behavior, and persisted overrides composed with multi-service availability.

The new migration and full integration suite passed on the isolated PostgreSQL 16.15 instance on 2026-10-27. The configured PostgreSQL 17 Compose target still needs verification when Docker access is available. Unit tests and typechecking do not require the database.

## Owner workspace

After configuring staff accounts, open `/workspace`. Add a service with a name, positive whole-minute duration and price (zero is allowed). Expand an existing service to edit it, or choose Archive and confirm. Archiving preserves its database record. English and Arabic labels, inline errors, pending states and a responsive layout are included. Existing shops without a currency must select one before adding services.

Each server action checks Origin and authenticates the session before passing its principal to the catalog repository. Submitted shop/service IDs remain subject to repository tenant and ownership checks. The server loads the shop currency, checks that the form still displays that currency, and rejects a concurrent currency change inside the creation transaction. No schema migration is needed for this UI increment.

`npm test` covers decimal conversion and action orchestration (including session/origin failures, denied access and stale currency). Repository authorization and currency-change checks are covered by `tests/catalog.integration.ts`, which needs PostgreSQL. Manually verify create/edit/archive in both languages, at mobile width, with a second owner account and an expired session. Database and browser verification remain pending in the current environment because no database URL is configured and Docker access is denied.

Service-management validation on October 28, 2026: lint, workspace typechecking, all 160 unit tests and both production builds passed. PostgreSQL integration and authenticated browser checks remain pending as noted above.

## Barber profiles and assignments

In the authenticated workspace, choose an existing shop member and enter a display name to create their separate barber profile. This includes the owner’s own membership. Each membership can have at most one profile per shop; concurrent attempts cannot create duplicates. A profile does not change the account role. Creating new staff accounts, invitations, role changes, and profile deletion are outside this increment. Weekly schedule and time-off editing are documented in [scheduling](scheduling.md).

Owners can rename a barber, enable an active shop service, set price/duration overrides, restore inheritance by clearing either override, and remove a service assignment with confirmation. A zero price is an explicit free-service override. Removal disables future service availability without deleting the barber, service or appointment records. Assignments alone do not make bookings available; saved schedules still need to be connected to a booking endpoint.

The catalog repository rechecks owner authorization and shop activation under its existing transaction locks for profile writes. Member and barber lookups use shop-scoped composite keys. Profile creation and renaming append audit events in the same transaction. The existing schema already enforces one profile per membership and tenant-safe references, so no new migration is required.

`barber-actions.test.ts` checks session/origin failures, input validation, inherited/zero overrides, currency conversion and repository error handling. The PostgreSQL catalog suite additionally covers tenant-safe membership selection, owner role preservation, simultaneous duplicate profile creation, profile audit records, stale owner roles and deactivated shops. Those PostgreSQL cases require the local database setup. Manually verify owner profile creation, rename, enabling services, overrides, restoring inheritance and confirmed removal in both languages on desktop and mobile.

Barber-management validation on October 28, 2026: lint, workspace typechecking, all 181 unit tests and both production builds passed. PostgreSQL integration and authenticated browser checks remain pending; the environment still lacks database configuration and Docker socket access.
