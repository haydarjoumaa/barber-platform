# Appointment reservation foundation

The appointment migration adds tenant-scoped reservation records and a database exclusion constraint. This is the storage boundary for preventing double-booking; there is no booking API or UI yet.

## Invariants

Each reservation belongs to one shop and one barber. Composite foreign keys reject a barber or optional client from another shop. A null client supports future guest workflows; guest details and service/price snapshots are not modeled yet. Approval status is required explicitly, so the database does not assume automatic or manual approval.

All times are UTC instants stored as `timestamptz(3)`. `startsAt < serviceEndsAt <= occupiedUntil` is required, with finite timestamps only. The occupied interval is `[startsAt, occupiedUntil)`, including any after-service buffer. Adjacent reservations can meet exactly at the occupied end.

The `appointments_no_barber_overlap` GiST exclusion constraint rejects intersecting occupied intervals for the same shop/barber, including concurrent inserts and updates. Only cancelled appointments are excluded from the constraint. Pending and confirmed reservations occupy time; completed and no-show records retain their historical occupancy. Cancelling releases an interval, while reactivating or rescheduling into an occupied interval fails. Staff cannot bypass this database constraint.

The migration uses PostgreSQL's [range exclusion constraints](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT) and [btree_gist extension](https://www.postgresql.org/docs/17/btree-gist.html) for UUID equality. Prisma cannot express the full constraint, so it is maintained in [custom migration SQL](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/unsupported-database-features). Use `npm run db:deploy`, not `prisma db push`, to install all protections. The migration role needs permission to create `btree_gist`; keep the custom SQL when evolving the schema.

## Local verification

1. Start the local PostgreSQL database using the README setup.
2. Run `npm run db:generate` and `npm run db:deploy`.
3. Run `npm run test:database`.

The test command accepts `DATABASE_URL` from the process environment or a local `.env`. Use a migrated development/test database. Tests create uniquely named shops and delete only their own fixtures; no real shop data is needed.

The suite checks tenant relations, guest/client references, independent barbers, invalid intervals, buffer conflicts, adjacency, lifecycle status changes and rejected rescheduling. Its concurrency cases hold an inserted reservation uncommitted and observe another backend waiting on its transaction lock. Committing makes the second writer fail with PostgreSQL exclusion-violation SQLSTATE `23P01`; rolling back lets the waiting writer succeed. These are real database tests, not mocked races.

Verified locally on 2026-10-27: both migrations applied to a fresh temporary PostgreSQL 16.15 database and all database tests passed. The configured PostgreSQL 17 Compose service was not tested because Docker socket access was unavailable; run the same suite on that version before beta.

## Before accepting bookings

Connect the [persisted service catalog](catalog.md) and add service/price snapshots, guest identity details, schedule repositories and booking authorization. The server must calculate durations, prices, occupied buffers, availability, minimum notice and the 30-day horizon from trusted records inside the booking transaction. This constraint alone does not enforce those rules or protect tenant reads. Overlap conflicts must become a safe slot-unavailable response with alternatives, never raw database errors. Cancellation/rescheduling deadlines and authorized policy overrides remain pending.
