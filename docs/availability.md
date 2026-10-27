# Shared availability calculations

`findAvailableSlots` in `packages/shared/src/availability.ts` is a pure calculation shared by the two applications. It has no database access and is not exposed through an API yet. It does not reserve appointments.

## Inputs and boundaries

The future server orchestration layer must load an authorized shop's service catalog and barbers. Every service and barber carries a shop ID; mixed-shop records are rejected, including records excluded by the selected barber filter. This is a defensive consistency check, not authentication or database tenant isolation. Never use request-supplied prices, schedules, roles or shop IDs as authoritative input.

Each barber has an explicit supported-service list, with optional price and duration overrides. Every selected service must be supported by the same barber. Duplicate selections are rejected. Durations use positive integer minutes; prices use nonnegative integer minor units in the shop's currency. The function does not choose a currency, format prices or implement payments.

All intervals use UTC epoch milliseconds and half-open bounds `[start, end)`. Working intervals are merged when they overlap or touch. Breaks, time off, closures and existing appointments are supplied as blocking intervals; appointment intervals must already include their occupied buffers. Adjacent appointments can touch without overlapping. Full service time plus the supplied after-service buffer must fit inside working time and avoid every blocker.

`bufferAfterMinutes` is an explicit input describing occupied time after the visit; this low-level representation does not decide how the eventual shop settings UI will configure buffers. Other padding can be represented by the schedule layer's blocking intervals as appropriate.

Candidate start instants are supplied explicitly. The function does not choose a slot cadence, round to a clock grid or interpret local wall-clock times. Start candidates are deduplicated and clipped to inclusive `earliestStart`/`latestStart` bounds. The caller must resolve minimum notice and the 30-day booking horizon into these bounds before exposing results. The helper alone does not enforce the 30-day product rule.

Results include barber ID, appointment start, service end, occupied end, total service duration and total price. They are sorted by start then barber ID. With no specific barber selection, the same start may occur once per eligible barber. An empty result means no supplied candidate fits; the caller can search another date to offer alternatives.

## Required before live booking

- Connect the implemented [local scheduling layer](scheduling.md) to authorized, persisted schedules. It converts working hours, replacements, breaks, time off and closure dates to UTC and exposes errors for nonexistent/repeated clock times. The staff workflow for resolving those errors is still needed.
- Apply publication state, staff permissions, approval mode, minimum notice and the 30-day booking horizon on the server.
- Load only appointment statuses that block availability under the agreed lifecycle rules, retaining occupied buffers.
- Recalculate prices/durations and availability from authoritative data inside the booking transaction.
- Install the [appointment reservation migration](reservations.md) and run its PostgreSQL concurrency tests before any appointment write endpoint exists. Add API-level race tests when implementing the endpoint. A successful availability lookup cannot prevent another request from taking the slot.
- Add cancellation/rescheduling policy checks and staff override authorization with audit records.

Run `npm test` to exercise duration calculations, service compatibility, tenant consistency, overrides, interval boundaries, buffers, closures, input validation and a Beirut DST transition. PostgreSQL is not needed for these tests.
