# Appointment reservation foundation

The appointment migration adds tenant-scoped reservation records and a database exclusion constraint. This is the storage boundary for preventing double-booking; an authenticated owner booking form now uses the transactional repository.

## Invariants

Each reservation belongs to one shop and one barber. Composite foreign keys reject a barber or optional client from another shop. A null client supports guest bookings; optional guest contact fields retain the name and phone on the appointment. Service snapshots are stored separately in `appointment_services`. Approval status is required explicitly, so the database does not assume automatic or manual approval.

All times are UTC instants stored as `timestamptz(3)`. `startsAt < serviceEndsAt <= occupiedUntil` is required, with finite timestamps only. The occupied interval is `[startsAt, occupiedUntil)`, including any after-service buffer. Adjacent reservations can meet exactly at the occupied end.

The `appointments_no_barber_overlap` GiST exclusion constraint rejects intersecting occupied intervals for the same shop/barber, including concurrent inserts and updates. Only cancelled appointments are excluded from the constraint. Pending and confirmed reservations occupy time; completed and no-show records retain their historical occupancy. Cancelling releases an interval, while reactivating or rescheduling into an occupied interval fails. Staff cannot bypass this database constraint.

The migration uses PostgreSQL's [range exclusion constraints](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT) and [btree_gist extension](https://www.postgresql.org/docs/17/btree-gist.html) for UUID equality. Prisma cannot express the full constraint, so it is maintained in [custom migration SQL](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/unsupported-database-features). Use `npm run db:deploy`, not `prisma db push`, to install all protections. The migration role needs permission to create `btree_gist`; keep the custom SQL when evolving the schema.

## Service snapshots

The `20261029000100_appointment_service_snapshots` migration adds ordered service lines to reservations. Each line copies the service name, effective duration, price in minor currency units and currency at booking time. Composite foreign keys require both the appointment and source service to belong to the same shop. A service can appear once per appointment, matching the existing availability engine's distinct service selection; positions are zero-based and unique within the appointment.

Catalog renaming, repricing, duration changes and archiving leave these copied values unchanged. Historical totals must use snapshots, never current catalog prices. Source services and appointments with snapshot lines cannot be deleted implicitly; any future privacy/deletion workflow must explicitly handle these records. Existing reservations are left without lines because their historical service choices cannot be reconstructed reliably.

Database checks reject empty names, negative positions/prices, nonpositive durations and malformed currency codes. The storage schema does not itself enforce the presence of service lines, a common currency across lines, alignment with appointment duration, or immutability against direct snapshot updates. The owner booking repository now calculates authoritative barber overrides and writes the appointment, snapshots and audit event atomically after revalidating availability. No snapshot write API is exposed.

## Local verification

1. Start the local PostgreSQL database using the README setup.
2. Run `npm run db:generate` and `npm run db:deploy`.
3. Run `npm run test:database`.

The test command accepts `DATABASE_URL` from the process environment or a local `.env`. Use a migrated development/test database. Tests create uniquely named shops and delete only their own fixtures; no real shop data is needed.

The suite checks snapshot tenant isolation, ordered multi-service history, catalog edits/archiving, duplicate and invalid snapshot values, protected source deletion, tenant relations, guest/client references, independent barbers, invalid intervals, buffer conflicts, adjacency, lifecycle status changes and rejected rescheduling. Its concurrency cases hold an inserted reservation uncommitted and observe another backend waiting on its transaction lock. Committing makes the second writer fail with PostgreSQL exclusion-violation SQLSTATE `23P01`; rolling back lets the waiting writer succeed. These are real database tests, not mocked races.

Verified locally on 2026-10-27: both migrations applied to a fresh temporary PostgreSQL 16.15 database and all database tests passed. The configured PostgreSQL 17 Compose service was not tested because Docker socket access was unavailable; run the same suite on that version before beta.

On 2026-10-29, all eight migrations were applied successfully to a fresh, temporary PostgreSQL 16.15 database extracted under `/tmp`. All 49 database tests passed, including snapshots, transactional owner bookings, rollback and concurrent writers. PostgreSQL 17 Compose verification remains pending.

## Transactional owner booking repository

`createOwnerBookings(database).create(principal, shopId, input)` accepts an existing shop client, a specific barber, distinct service IDs, the shop-local date and an exact UTC start timestamp. Principals must come from verified staff sessions. The repository rechecks ownership and shop activation, verifies client tenancy, then calls the same availability calculation used by owner searches inside one transaction. It derives service names, prices, effective durations, buffer and Pending/Confirmed status from stored records. No request-supplied price, duration or status is trusted.

The shop row lock serializes owner bookings with owner catalog, policy and schedule edits. A second request for the same slot rechecks occupancy after the first commits and receives `SlotUnavailableError`. The exclusion constraint also protects against appointment writers outside this lock. All future schedule/catalog/booking write paths must preserve the locking protocol. Direct database administration is outside this application guarantee.

Appointment creation, ordered snapshots and the `booking.created` audit event commit together; a failure rolls everything back. Tests cover authoritative overrides, both approval modes, stale search results, minimum notice, horizon, grid alignment, tenant/RBAC boundaries, concurrent requests and rollback on audit failure. The helper now consistently returns rejected promises for unauthorized owner operations.

The workspace server action now calls this repository after origin/session checks, with client selection and a localized confirmation. Owners can register client profiles with an international phone number. Broader staff policy overrides, automatic assignment without selecting a returned barber slot, client authorization, client cancellation/rescheduling and advanced calendar interactions follow in separate increments. Saved day/week/month appointment views are connected. A slot conflict requires a new availability search for alternatives.

## Before accepting bookings

Extend the connected owner workflow with client access boundaries. Preserve its transactional calculation of durations, prices, occupied buffers, availability, minimum notice and the 30-day horizon. This constraint alone does not enforce those rules or protect tenant reads. Overlap conflicts must become a safe slot-unavailable response with alternatives, never raw database errors. Owner cancellation now enforces its deadline with an explicit owner override. Client cancellation and rescheduling remain pending.

## Owner approval

The daily owner appointment list provides **Confirm appointment** for pending bookings. The authenticated action checks request origin and session; the repository rechecks active shop ownership and conditionally updates only the requested tenant's pending appointment. The status update and `booking.confirmed` audit event share one transaction. Concurrent approval attempts yield one success and one audit event; stale requests fail without changing other statuses. Approval preserves times, occupied buffers and service snapshots. Pending reservations already occupy the barber's time, so approval does not perform a new availability search. No schema migration is needed for approval. Rescheduling controls remain pending; completion and no-show recording are described below.

Run `npm run check` and `npm run test:database` against the migrated local database to verify the action boundaries, authorization, concurrency and audit rollback.


## Owner cancellation

Pending and confirmed appointments have a cancellation control with a confirmation step in English and Arabic. The repository uses the current saved shop policy and a server clock: cancellation is allowed up to and including `startsAt - cancellationNoticeMinutes`. Minutes represent elapsed time between UTC instants, so DST changes do not alter the notice duration. Past the deadline, the owner must explicitly select the override checkbox. Missing booking policies fail closed even with an override.

The repository rechecks active shop ownership, tenant scope and the expected appointment status. A conditional update prevents stale or concurrent requests from silently cancelling an appointment with a different status. Completed, no-show and already cancelled records cannot be cancelled through this operation. Cancellation and its audit event commit together; the event records the actor, prior status, notice period, server check time and whether the deadline was overridden. Service snapshots and appointment times remain intact. The existing exclusion constraint releases cancelled occupancy without a new migration.

Use **Cancel appointment** in the saved daily list, then **Confirm cancellation**. If the deadline has passed, explicitly select the owner override and retry. On a stale-state error, refresh the list before deciding again. Database tests cover deadline boundaries, slot reuse, tenant/RBAC checks, concurrency and audit rollback.


## Owner appointment outcomes

The saved appointment list exposes **Mark completed** and **Mark no-show** for pending and confirmed appointments, with English/Arabic confirmation controls. The owner explicitly records the real-world outcome; no automatic clock-based transition or payment inference is introduced. The initial outcome operation accepts only pending/confirmed records. Corrections to completed/no-show outcomes and reopening cancelled records remain separate future work, disclosed in the confirmation text.

`recordOutcome` rechecks active shop ownership and tenant scope, then conditionally updates the expected status and writes `booking.completed` or `booking.no_show` in the same transaction. The audit includes the actor, appointment ID, previous status and selected outcome. Stale submissions and competing outcomes cannot overwrite a changed status or create duplicate audit records. An audit failure rolls the status change back.

Appointment instants, occupied buffers and service snapshots remain unchanged. Both outcomes continue to occupy their original interval under the existing exclusion constraint. No migration is needed. Tests cover both outcomes, pending/confirmed inputs, retained occupancy/history, stale and concurrent writes, revoked access, cross-tenant IDs and audit rollback. Run the usual `npm run check` and `npm run test:database` checks.


## Saved calendar ranges

`calendar(principal, shopId, date, view)` loads a bounded day, Monday-first week or complete month grid (including surrounding dates). The existing `day` method delegates to it. Both recheck active owner membership and scope the query to the shop. Local date boundaries resolve to UTC separately, so a Beirut DST week can contain 167 or 169 hours. Queries use `startsAt < range.end` and `occupiedUntil > range.start`, preserving overnight carry-in and buffers while excluding records that merely touch an outside boundary. All statuses are included, and service snapshots supply historical details.

The workspace stores date/view in the URL. Week/month cards group records by overlapping local date and link to daily controls. A record spanning midnight can appear on multiple cards. Empty calendar dates are not availability results. Desktop uses a seven-column date grid; narrower screens use two or one columns. No migration is required. Tests cover bounded ranges, month padding, tenant/RBAC checks, DST boundaries and overnight buffers.


## Guest and quick-booking

The owner form explicitly selects an existing client, a new client or a guest. One transactional repository handles all three paths, using the same tenant authorization, availability calculation, exclusion constraint, service snapshots and audit writes. New clients require a name and international phone; guest phones are optional. A new client is created in the same transaction as its booking, so slot conflicts or later failures roll it back. Duplicate shop phone numbers direct staff to the existing-client option without overwriting the profile. No login credentials are created.

Guest names and phones live on the appointment. Database checks prohibit guest contact fields on client-linked appointments and reject invalid contact formats. Historical anonymous reservations remain valid. Apply the guest-contact migration with `npm run db:deploy`; verify the focused path with `npm run test:booking-smoke`.
