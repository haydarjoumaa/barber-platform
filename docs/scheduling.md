# Local schedules and UTC

The shared scheduling module expands a barber's weekly hours and date-specific overrides into the UTC intervals accepted by `findAvailableSlots`. It is a pure calculation: no database, API or appointment mutations are involved.

## Schedule representation

- `timeZone` is an explicit named timezone, normally `Asia/Beirut`. Fixed numeric offsets are rejected because they cannot express DST rules.
- Weekdays use ISO numbering: Monday 1 through Sunday 7. Missing weekdays mean no shift starts on that day.
- `dates` lists local dates on which shifts start. Include the preceding date when querying a day that could receive an overnight shift from the previous day, then filter candidate starts to the requested day. The resolver does not clip shifts at midnight.
- Each period has `start`/`end` in `HH:mm` and explicit `endDayOffset` (0 or 1). Overnight shifts must opt in to next-day endings. `startDayOffset: 1` supports breaks after midnight in an overnight shift; otherwise start offset is 0.
- An override replaces all working periods and breaks for its anchor date. An empty override prevents new shifts from starting that date; it does not erase a previous day's overnight shift. Use a calendar-day closure or explicit time off when all work within the local day must be blocked.
- Time off has explicit local start/end dates and times. Shop closures are entire local calendar dates. Both become blocking intervals; changing a schedule never cancels existing bookings.
- The caller must load authorized tenant-scoped records. The request checks that the barber belongs to its shop; this is not a substitute for server authorization or database-safe relations. Child periods belong to the supplied barber and must never be populated from untrusted request records.

## DST behavior

`resolveLocalInstant` strictly validates calendar dates and minute-resolution clock times. A nonexistent clock time throws `LocalTimeError` with code `NONEXISTENT_TIME`; it is never silently moved to another time. A repeated clock time throws `AMBIGUOUS_TIME` unless its endpoint explicitly chooses the earlier or later occurrence. Schedule periods expose separate choices for start and end.

This is a fail-closed domain API, not an automatic business policy for recurring schedules. The eventual staff workflow must surface these errors and obtain a valid replacement time or an explicit repeated-hour choice. Until then, a problematic schedule fails the complete calculation rather than producing partial or misleading availability.

Whole-day closures are different from a specific clock-time appointment. They begin at the first existing instant of the date and end at the first instant of the next date. Beirut's spring transition skips midnight: a closure still covers the whole day, which is 23 elapsed hours. A date spanning the repeated autumn hour can contain 25 hours. A wholly skipped calendar date is rejected.

The implementation uses the open-source Temporal polyfill and the runtime's timezone data, following the official [Temporal timezone semantics](https://tc39.es/proposal-temporal/docs/timezone.html) and [calendar-date conversion semantics](https://tc39.es/proposal-temporal/docs/plaindate.html). Keep runtime timezone data current; do not hard-code Beirut offsets.

## Verification and remaining work

Run `npm test`. Tests cover winter/summer offsets, nonexistent and repeated Beirut times, 23/25-hour closures, invalid inputs, weekly expansion, replacements, overnight shifts/breaks and composition with availability blockers. They do not require PostgreSQL.

Schedule persistence and editing UI, candidate-slot cadence, minimum notice, the 30-day horizon and authenticated APIs remain to be implemented. Reservation must still revalidate authoritative data in a database transaction protected against overlapping bookings.
