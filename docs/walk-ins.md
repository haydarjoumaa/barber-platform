# Walk-ins and waiting queue

Staff with appointment permission (owners, plus barbers/receptionists granted it) find **Walk-ins and waiting queue** in `/workspace` once booking policies are saved. Apply migration `20261102000200_walk_ins` first.

## Walk-ins (agreed November 2, 2026)

- For a client who is already in the shop. Identity is an existing client, a new client profile (name + phone) or a guest.
- Books the **earliest free minute from now until shop-local midnight** for the chosen barber or any barber. Barbers can only book themselves.
- Skips the slot interval and minimum notice, and is **confirmed immediately**, even in manual-approval shops.
- Still respects working hours, breaks, time off, schedule overrides, shop closures, other bookings and the shop buffer. The exclusion constraint guards races.
- The price and duration snapshot is taken from the current catalog, as with normal bookings.
- Stored as `appointments.walk_in = true` and shown with a **Walk-in** badge in the calendar. A `booking.walk_in_created` audit event is recorded.
- If nobody is free for the rest of today, staff are told to choose another barber or use the queue.

## Waiting queue

- One staff-only queue per shop, turned on/off by the owner (`barbershops.walk_in_queue_enabled`, default off, audited as `shop.walk_in_queue_toggled`). Clients can't see or join it.
- An entry holds an existing client or a guest (name, optional phone), the requested services and an optional preferred barber. New client profiles aren't created from the queue; register the client first.
- Entries are listed in arrival order with their completed minutes of waiting. A shared page clock updates the displayed wait every 15 seconds while entries are present; this does not fetch new queue entries or refresh availability.
- **Serve now** turns the entry into a walk-in. It uses the barber chosen in the row, then the preferred barber, then any barber; a barber serving the queue always takes the client. The entry becomes `SERVED` and is linked to the appointment in the same transaction.
- Staff can explicitly select a replacement even when only one active barber remains, for example after the preferred barber's access is disabled. The preference is not silently replaced. Serving is disabled in the UI when no barber is available in the catalog; removing the entry remains possible.
- **Remove** marks it `REMOVED`. Entries are never deleted. Turning the queue off blocks new entries but still lets staff serve or remove waiting ones.
- Audit events: `queue.joined`, `queue.removed`. Served entries appear in `booking.walk_in_created` with `queueEntryId`.

## Disabled staff

Barbers whose shop access is disabled are no longer offered for any new booking: online, staff, walk-in or queue preference. Their existing appointments are unchanged and can still be managed or rescheduled.

## Tests

- `tests/walk-ins.integration.ts` (part of `npm run test:database`): off-grid start, skipped notice and approval, occupancy and buffer, disabled barbers, queue gating, ordering, serve/remove idempotency, end-of-day and audits.
- `packages/shared/src/walk-in.test.ts`: minute rounding, midnight cutoff and the 23-hour DST day.
- `tests/browser/booking.spec.ts`: owner-only queue toggles, receptionist guest arrivals, arrival order and persistence, and removal/renumbering after disabling new arrivals. This extended Chromium scenario passed on November 10. Serving remains covered at the database integration layer.

Both the unit and PostgreSQL walk-in checks passed during the November 9 verification pass. The database test exposed a display-only identity field leaking into the appointment insert; the writer now selects only persisted fields.
