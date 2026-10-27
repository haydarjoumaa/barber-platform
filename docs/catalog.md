# Persistent service catalog

The database package now stores shop services and explicit barber/service assignments. Owner-only server operations create, update and archive services; set or remove barber assignments; configure the shop currency; and load the active catalog. No public API or editing form is connected yet.

## Server boundary

Import `createServiceCatalog` and `getDatabase` from `@barber/database`. The package entry is server-only. Every method requires a `StaffPrincipal` built from a verified session and a shop ID. Never construct that principal from request JSON or trust a request's role claim.

Each operation first checks the principal's owner membership, then rechecks the current database membership and shop deactivation status inside a transaction. The shop and membership rows are locked until completion using PostgreSQL [row-level locks](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS). This prevents a concurrent role revocation or shop deactivation from slipping between authorization and mutation. Catalog operations for a shop are serialized; these transactions must remain short. Future role/deactivation workflows must use consistent lock ordering.

All catalog queries scope tenant-owned records to the authorized shop. Composite foreign keys also prevent cross-shop barber/service assignments. This is an owner management repository, not a public booking catalog or a general authorization system. Platform support access is not provided by these methods.

Successful mutations append an `audit_events` record in the same transaction, with actor, shop, event type and relevant catalog values. Service updates include before/after values. The repository has no audit modification/deletion operation. Database role restrictions, broader security event coverage and shop deletion/retention workflows are still pending; the table alone is not a tamper-proof audit system.

## Prices and overrides

Existing shops have a null currency until explicitly configured. `setCurrency` accepts currency codes supported by the runtime's Intl currency data. No default currency or exchange rate is assumed. Service creation requires a configured currency; the server copies it from the shop rather than accepting it in service input. A composite foreign key ensures all service prices belong to that shop/currency pair. Currency changes are blocked while service records exist, including archived records, to prevent relabeling historical prices. A future currency-conversion workflow would need an explicit design.

Prices are integer minor units, including zero; durations are positive integer minutes. Storage uses PostgreSQL signed 32-bit integers. Formatting and conversion between displayed amounts and minor units must use the configured currency's precision before the UI is connected. No checkout or payment integration is introduced.

A barber supports a service only when its assignment row exists. `setBarberService` replaces both override values: null means inherit the current shop service value, while zero is a valid price override. Removing an assignment removes support for future availability. Archiving a service preserves its record and assignments but excludes both from `list`. Changes do not alter existing appointments; appointment service/price snapshots remain to be added.

`list` returns the shop currency, active services and barbers with supported-service options. These service and barber records compose with the shared availability engine once authoritative working intervals and blockers are supplied. Persisted schedules, booking policies and transactional booking revalidation are still required.

## Verification

Run `npm run db:generate`, `npm run db:deploy` and `npm run test:database` against a local development database. The tests verify owner RBAC, stale/forged role claims, deactivated shops, cross-shop references and mutations, explicit currency, input validation, audit records, archive behavior, and persisted overrides composed with multi-service availability.

The new migration and full integration suite passed on the isolated PostgreSQL 16.15 instance on 2026-10-27. The configured PostgreSQL 17 Compose target still needs verification when Docker access is available. Unit tests and typechecking do not require the database.
