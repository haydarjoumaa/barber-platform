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

This is a fail-closed domain API, not an automatic business policy for recurring schedules. Owner forms surface these errors and require a valid replacement time or an explicit repeated-hour choice. A problematic schedule fails the complete calculation rather than producing partial or misleading availability.

Whole-day closures are different from a specific clock-time appointment. They begin at the first existing instant of the date and end at the first instant of the next date. Beirut's spring transition skips midnight: a closure still covers the whole day, which is 23 elapsed hours. A date spanning the repeated autumn hour can contain 25 hours. A wholly skipped calendar date is rejected.

The implementation uses the open-source Temporal polyfill and the runtime's timezone data, following the official [Temporal timezone semantics](https://tc39.es/proposal-temporal/docs/timezone.html) and [calendar-date conversion semantics](https://tc39.es/proposal-temporal/docs/plaindate.html). Keep runtime timezone data current; do not hard-code Beirut offsets.

## Verification and remaining work

Run `npm test`. Tests cover winter/summer offsets, nonexistent and repeated Beirut times, 23/25-hour closures, invalid inputs, weekly expansion, replacements, overnight shifts/breaks and composition with availability blockers. They do not require PostgreSQL.

Owner weekly schedule and time-off persistence/editing are now implemented as described below. Date-specific replacements and shop closures are also implemented below. The owner availability check now applies shop-selected candidate cadence, minimum notice and the 30-calendar-day horizon; public availability APIs remain pending. Reservation must still revalidate authoritative data in a database transaction protected against overlapping bookings.

## Saved owner schedules

Apply `npm run db:deploy` before opening the updated workspace. Migration `20261028000100_barber_schedules` adds `barber_schedule_periods` and `barber_time_off`, with composite barber/tenant foreign keys, interval checks and weekday/occurrence constraints. Existing shops receive no assumed working hours.

In `/workspace`, expand a barber’s **Working hours and time off** section. Add weekly working periods or breaks, selecting the weekday on which the shift starts. Multiple periods per weekday are supported. For an overnight shift, explicitly choose a next-day end. A break after midnight uses the original shift weekday and next-day start/end. Empty weekdays have no shifts. Remove a period with confirmation and add a replacement to change it; in-place editing of weekly periods remains pending. Date-specific replacements have their own editing form.

Weekly periods store wall-clock minutes relative to their anchor weekday and explicit optional repeated-hour choices. Dated time off is resolved in the database-owned shop timezone and stored as UTC instants. Gaps are rejected; repeated times require an explicit first/second occurrence. Those errors display the affected local date/time. Recurring hours can be saved before a DST transition is encountered; previewing an affected date fails closed until the period is replaced with valid times or explicit occurrence choices.

The date preview loads saved periods, expands the requested and preceding day, and clips the resulting intervals to the selected shop-local day. Stored time off overlapping that day is added to the separate blocker list. Displayed timestamps include UTC offsets to distinguish repeated hours. A successful local mutation resets the preview. It is a working-hours preview, not available booking slots: existing appointments and booking policies are not included, and blockers are listed separately rather than subtracted from the displayed working intervals.

The server actions check request origin and verified sessions. Repository operations use the same owner transaction boundary as catalog operations, rechecking current membership and shop activation under row locks, then checking the barber’s tenant. Writes and audit events commit together. Removal is scoped to both shop and barber. Exact duplicate weekly periods are rejected under that lock, including concurrent attempts. Schedule changes never automatically modify existing appointments; owners must handle affected bookings manually.

Run `npm run test:database` against a migrated PostgreSQL database for schedule foreign-key/check constraints, owner RBAC, stale roles, deactivated shops, concurrent duplicates, audit events, overnight carry-in, time-off persistence and DST checks. Unit tests cover period conversion and server action boundaries. Manual checks: both languages, mobile width, a 22:00–02:00 shift with a 00:30–01:00 next-day break, a dated absence, a DST gap/repeated hour, removal confirmation and preview refresh. Database integration and browser verification remain pending while the local database is unavailable.

Validation on October 28, 2026: lint, workspace typechecking, all 206 unit tests, Prisma schema validation and both production builds passed. The new migration has not been applied here; PostgreSQL integration and authenticated browser checks remain pending.

## Date-specific changes and shop closures

Apply migration `20261028000200_schedule_exceptions` with `npm run db:deploy`. It adds a unique barber/date replacement record with a JSON array of validated periods, and unique shop/local-date closure records. Both have tenant-safe foreign keys. Database constraints require an array for replacement periods; the repository validates every element and its actual date/DST behavior before writing, and validates stored elements again when reading them into scheduling calculations. An invalid replacement rolls back without changing an existing record or adding an audit event.

Under a barber’s schedule, choose a date and add all working periods and breaks for that date. Saving replaces the whole date’s weekly definition, including its breaks, and any previously saved replacement for that date. Save an empty list to prevent shifts from starting that date. Edit the saved replacement or choose **Restore weekly hours** and confirm to remove it. A shift starting the previous day can still continue into the date; use dated time off to block that barber for the whole day when required.

The shop’s **Shop closure dates** section blocks an entire local calendar date for every barber, including overnight carry-in. Closures follow named-zone calendar boundaries, including 23-hour and 25-hour Beirut days. Add or remove a closure without changing existing appointment records; affected appointments must be reviewed manually. Concurrent duplicate closure additions cannot create multiple rows.

The preview loads date replacements for the selected and preceding dates and includes shop closures in its separate blocker list. Closure changes and replacement updates reset the rendered preview. The separate owner availability check includes appointments and notice/horizon/buffer policies; booking writes still require transactional revalidation.

All mutations recheck owner membership and shop activation inside the shared transaction boundary and append audit events transactionally. Replacement audit events retain the previous and new periods. Closure deletion and replacement deletion are scoped to the authorized shop, with replacement deletion additionally scoped to its barber.

Tests cover empty replacements versus overnight carry-in, full replacement of weekly breaks, malformed arrays, authenticated actions, DST closure lengths, atomic replacement updates, rollback on invalid DST times, cross-shop mutation failures, concurrent closure creation and preservation of existing appointments. PostgreSQL cases and browser checks still need a configured local database. Manual checks: save and edit a replacement, save an empty day, restore weekly hours, add/remove a closure, and verify the preview in both languages, especially across an overnight shift and DST dates.

Schedule-exception validation on October 28, 2026: lint, workspace typechecking, all 217 unit tests, Prisma schema validation and both production builds passed. The new migration is unapplied here; PostgreSQL integration and authenticated browser verification remain pending.
