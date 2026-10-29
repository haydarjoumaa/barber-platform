# Shared availability calculations

`findAvailableSlots` in `packages/shared/src/availability.ts` is a pure calculation shared by the two applications. It has no database access; an authenticated owner server action now calls it through a persisted-data repository. Public booking APIs remain pending. It does not reserve appointments.

## Inputs and boundaries

The server orchestration layer loads an authorized shop’s service catalog and barbers. Every service and barber carries a shop ID; mixed-shop records are rejected, including records excluded by the selected barber filter. This is a defensive consistency check, not authentication or database tenant isolation. Never use request-supplied prices, schedules, roles or shop IDs as authoritative input.

Each barber has an explicit supported-service list, with optional price and duration overrides. Every selected service must be supported by the same barber. Duplicate selections are rejected. Durations use positive integer minutes; prices use nonnegative integer minor units in the shop's currency. The function does not choose a currency, format prices or implement payments.

All intervals use UTC epoch milliseconds and half-open bounds `[start, end)`. Working intervals are merged when they overlap or touch. Breaks, time off, closures and existing appointments are supplied as blocking intervals; appointment intervals must already include their occupied buffers. Adjacent appointments can touch without overlapping. Full service time plus the supplied after-service buffer must fit inside working time and avoid every blocker.

`bufferAfterMinutes` is an explicit input describing occupied time after the visit; this low-level representation does not decide how the eventual shop settings UI will configure buffers. Other padding can be represented by the schedule layer's blocking intervals as appropriate.

Candidate start instants are supplied explicitly. The function does not choose a slot cadence, round to a clock grid or interpret local wall-clock times. Start candidates are deduplicated and clipped to inclusive `earliestStart`/`latestStart` bounds. The caller must resolve minimum notice and the 30-day booking horizon into these bounds before exposing results. The helper alone does not enforce the 30-day product rule.

Results include barber ID, appointment start, service end, occupied end, total service duration and total price. They are sorted by start then barber ID. With no specific barber selection, the same start may occur once per eligible barber. An empty result means no supplied candidate fits; the caller can search another date to offer alternatives.

## Required before live booking

- Reuse the owner availability repository’s persisted schedule loading and shared policy calculations when building the public booking path. Owner schedule forms already surface nonexistent/repeated clock-time errors.
- Add publication-aware client access. Owner reads and booking writes enforce owner permissions, minimum notice and the 30-calendar-day horizon; booking writes also apply approval mode.
- Keep appointment occupancy aligned with the database exclusion constraint: every status except CANCELLED blocks its full occupied interval.
- Recalculate prices/durations and availability from authoritative data inside the booking transaction.
- Install the [appointment reservation migration](reservations.md) and run its PostgreSQL concurrency tests before any appointment write endpoint exists. Add API-level race tests when implementing the endpoint. A successful availability lookup cannot prevent another request from taking the slot.
- Add cancellation/rescheduling policy checks and staff override authorization with audit records.

Run `npm test` to exercise duration calculations, service compatibility, tenant consistency, overrides, interval boundaries, buffers, closures, input validation and a Beirut DST transition. PostgreSQL is not needed for these tests.

## Owner availability and explicit policies

Apply migration `20261028000300_booking_policies` with `npm run db:deploy`. No shop receives assumed policy defaults: owners explicitly choose slot interval (1–1440 whole minutes), minimum notice, after-service buffer, cancellation/rescheduling notice and automatic/manual approval. Zero notice/buffer is allowed. Policy writes use the owner transaction boundary and append before/after audit records. The owner booking repository applies approval mode; cancellation/rescheduling workflows remain pending.

The user confirmed that each shop chooses its slot interval and that the horizon is 30 **local calendar days**, rather than 720 elapsed hours. Candidate starts use a shop-local midnight grid. Missing clock times are omitted; both UTC instants of a repeated local time are included and displayed with UTC offsets. Minimum notice uses elapsed minutes from server time. The horizon compares each candidate’s local date/time with server time converted to the shop timezone plus 30 calendar days. Both repeated occurrences qualify if their wall time is within the limit; nonexistent boundary times are never shifted to admit a later start.

In `/workspace`, save policies, select one or more services, choose a date and a barber (or any available), and run **Check availability**. The owner action verifies Origin and session, then the repository rechecks ownership and shop activation under the existing transaction lock. Unpublished shops can use this owner setup check; no public availability route is exposed. Submitted prices, clock values, schedules, roles and policy values are never inputs to the search.

The repository loads active shop services and supported barber assignments, computes authoritative durations/prices, expands the preceding date and all dates touched by the potential occupied interval, and loads closures, time off and appointments across that range. Non-cancelled appointments block through `occupiedUntil`, including their original buffers. The lookup requires the whole selected-service duration plus current buffer to fit working time and avoid blockers, including closures beginning after midnight. The shared stored-schedule loader is also used by the schedule-only preview.

Results identify services, barber, start/end, total duration, currency/price, approval mode and check time. They are snapshots, never reservations. Changing the form selection hides the previous result. The next-date control changes the selection for another explicit search; it does not claim that date has availability. Booking must re-read and revalidate inside a transaction protected by the exclusion constraint before writing any appointment. Cancellation/rescheduling actions and staff policy overrides remain pending.

Computation is bounded: a service selection whose occupied duration exceeds 365 days is rejected with an error rather than expanding unbounded schedule dates or returning misleading slots. This is a defensive lookup limit; normal barber services should be far shorter. A problematic recurring DST definition fails the lookup and must be corrected through a date replacement or explicit repeated-hour choices.

Unit tests cover policy validation, local-calendar horizons across spring/autumn DST, nonexistent/repeated candidates, minimum notice, range expansion, origin/session boundaries and request-field rejection. `tests/availability.integration.ts` covers policy audit/rollback, tenant and role checks, service overrides, pending/completed/no-show occupancy, cancellation release, buffers, closures, time off, date replacements and overnight closure boundaries. The PostgreSQL suite requires a migrated database. Manual checks remain: both languages, mobile layout, a multi-service lookup, a specific versus any barber, policy changes, no-slots results, next-date navigation and stale-result timestamps.

Validation on October 28, 2026: lint, workspace typechecking, all 236 unit tests, Prisma schema validation and both production builds passed. At that time, PostgreSQL integration and authenticated browser checks remained pending. On October 29, all eight migrations and all 49 database tests passed on a fresh temporary PostgreSQL 16.15 instance, including transactional owner bookings. PostgreSQL 17 and authenticated browser checks remain pending.


## Owner booking writes

The internal `searchBookingAvailability` transaction helper is shared by owner search and `createOwnerBookings`. Per-slot effective service lines feed persisted snapshots, preventing a separate pricing implementation. The booking repository rechecks the exact selected instant after acquiring the owner shop lock, then writes the appointment, snapshots and audit record atomically. See [reservation and booking boundaries](reservations.md). Public booking APIs remain pending. The owner workspace now lets staff with owner access select a client and returned slot, save the booking, and view it by date.
