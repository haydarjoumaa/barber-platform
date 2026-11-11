# Rescheduling

Pending and confirmed upcoming appointments can be moved by staff (daily calendar in `/workspace`) and by signed-in clients (`/{shopSlug}/account`, upcoming view). Guests cannot reschedule online.

## Rules (agreed November 2, 2026)

- **Original values are kept.** The saved services, prices, total service duration and buffer don't change, even if the catalog, barber overrides or policy buffer changed since booking. Only the start and end times move.
- **Same barber.** To change barber, cancel and book again. That booking uses current catalog values.
- New times must satisfy the current slot interval, minimum notice, 30-day horizon, the barber's schedule, breaks, time off, shop closures and other bookings. The appointment being moved does not block itself. The PostgreSQL exclusion constraint still rejects races (reported as "slot taken").
- **Rescheduling deadline** (`reschedulingNoticeMinutes`): after it passes, clients can't reschedule online. Barbers and receptionists with appointment permission are also blocked. Owners may explicitly override, and the override is recorded in the audit log.
- **Status**: staff moves keep the current status. In a manual-approval shop, a client move puts the appointment back to **Pending**. In an automatic-approval shop it keeps its status.
- Barbers with appointment permission can only move their own appointments.
- Every move compare-and-swaps the expected start time, so stale forms fail safely.

## Records

- Staff: `booking.rescheduled` audit event with before/after start and status, the notice policy, check time and `deadlineOverridden`.
- Client: `booking.rescheduled` client event with before/after start and status.

## Code

- Shared core: `packages/database/src/booking-reschedule.ts`. It reuses `loadBookingSchedule` (with the excluded appointment) and `findAvailableSlots` with a synthetic service built from the saved duration and buffer.
- Staff: `createOwnerBookings().rescheduleOptions` / `.reschedule`. Client: `createClientBookings().rescheduleOptions` / `.reschedule`.
- UI: shared two-step `RescheduleForm` in `packages/ui`: pick a date, find open times, then move.

## Tests

`tests/reschedule.integration.ts` (part of `npm run test:database`) covers kept values after catalog/policy edits, occupancy and working-hour bounds, stale forms, deadlines and owner override, and audit events. It passed during the November 9 verification pass. `tests/client-operations.integration.ts` additionally checks client ownership, kept values, manual review and stale requests; the browser suite exercises the client rescheduling form. Dedicated barber-scoped rescheduling coverage remains to be added.
