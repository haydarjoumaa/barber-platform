import { Temporal } from "@js-temporal/polyfill";
import { resolveClosureDate } from "./scheduling";
export const MAX_BOOKING_HORIZON_DAYS = 30;

export interface BookingPolicy {
  slotIntervalMinutes: number;
  minimumNoticeMinutes: number;
  bufferAfterMinutes: number;
  cancellationNoticeMinutes: number;
  reschedulingNoticeMinutes: number;
  approvalMode: "AUTOMATIC" | "MANUAL";
}
export function validateBookingPolicy(input: BookingPolicy): BookingPolicy {
  for (const value of [input.slotIntervalMinutes, input.minimumNoticeMinutes, input.bufferAfterMinutes, input.cancellationNoticeMinutes, input.reschedulingNoticeMinutes]) {
    if (!Number.isInteger(value) || value < 0 || value > 2_147_483_647) throw new Error("Invalid booking policy");
  }
  if (input.slotIntervalMinutes < 1 || input.slotIntervalMinutes > 1440 || !["AUTOMATIC", "MANUAL"].includes(input.approvalMode)) throw new Error("Invalid booking policy");
  return { slotIntervalMinutes: input.slotIntervalMinutes, minimumNoticeMinutes: input.minimumNoticeMinutes, bufferAfterMinutes: input.bufferAfterMinutes,
    cancellationNoticeMinutes: input.cancellationNoticeMinutes, reschedulingNoticeMinutes: input.reschedulingNoticeMinutes, approvalMode: input.approvalMode };
}

/** Midnight-anchored wall-clock grid. Skip gaps; offer both instants in a repeated hour. */
export function bookingCandidates(date: string, timeZone: string, policy: BookingPolicy, now: number): number[] {
  validateBookingPolicy(policy);
  resolveClosureDate(date, timeZone); // Strict date and named timezone validation.
  const localNow = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone).toPlainDateTime();
  const lastLocal = localNow.add({ days: MAX_BOOKING_HORIZON_DAYS });
  const day = Temporal.PlainDate.from(date);
  if (Temporal.PlainDate.compare(day, localNow.toPlainDate()) < 0 || Temporal.PlainDate.compare(day, lastLocal.toPlainDate()) > 0) return [];
  const earliest = now + policy.minimumNoticeMinutes * 60_000;
  const candidates = new Set<number>();
  for (let minute = 0; minute < 1440; minute += policy.slotIntervalMinutes) {
    const local = day.toPlainDateTime({ hour: Math.floor(minute / 60), minute: minute % 60 });
    if (Temporal.PlainDateTime.compare(local, lastLocal) > 0) continue;
    for (const disambiguation of ["earlier", "later"] as const) {
      const instant = local.toZonedDateTime(timeZone, { disambiguation });
      if (instant.toPlainDateTime().equals(local) && instant.epochMilliseconds >= earliest) candidates.add(instant.epochMilliseconds);
    }
  }
  return [...candidates].sort((a, b) => a - b);
}

/** Extra anchor dates ensure long/overnight services see all later closures and blockers. */
export function availabilityDates(date: string, occupiedMinutes: number, timeZone: string, lastCandidate: number): string[] {
  // Bound computation, not booking policy. Oversized records fail explicitly rather than returning misleading slots.
  if (!Number.isSafeInteger(occupiedMinutes) || occupiedMinutes < 1 || occupiedMinutes > 365 * 1440) throw new Error("Availability span too large");
  const day = Temporal.PlainDate.from(date);
  const lastDay = Temporal.Instant.fromEpochMilliseconds(lastCandidate + occupiedMinutes * 60_000 - 1).toZonedDateTimeISO(timeZone).toPlainDate();
  const days = day.until(lastDay).days;
  if (days < 0 || days > 367) throw new Error("Invalid availability dates");
  return Array.from({ length: days + 2 }, (_, index) => day.add({ days: index - 1 }).toString());
}
