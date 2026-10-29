import { describe, expect, it } from "vitest";
import { bookingCandidates, validateBookingPolicy, availabilityDates, type BookingPolicy } from "./booking-policy";
const policy: BookingPolicy = { slotIntervalMinutes: 15, minimumNoticeMinutes: 0, bufferAfterMinutes: 0, cancellationNoticeMinutes: 0, reschedulingNoticeMinutes: 0, approvalMode: "AUTOMATIC" };
describe("booking policy and candidate grid", () => {
  it("uses minimum notice and a midnight-anchored local grid", () => {
    const slots = bookingCandidates("2026-07-01", "Asia/Beirut", { ...policy, minimumNoticeMinutes: 60, slotIntervalMinutes: 20 }, Date.parse("2026-07-01T05:07Z"));
    expect(slots[0]).toBe(Date.parse("2026-07-01T06:20Z"));
  });
  it("uses 30 local calendar days rather than 720 hours across spring DST", () => {
    const slots = bookingCandidates("2026-03-29", "Asia/Beirut", policy, Date.parse("2026-02-27T07:00Z"));
    expect(slots.at(-1)).toBe(Date.parse("2026-03-29T06:00Z"));
    expect(slots).not.toContain(Date.parse("2026-03-29T06:15Z"));
  });
  it("keeps the same local horizon across autumn DST", () => {
    const slots = bookingCandidates("2026-10-25", "Asia/Beirut", policy, Date.parse("2026-09-25T06:00Z"));
    expect(slots.at(-1)).toBe(Date.parse("2026-10-25T07:00Z"));
  });
  it("skips missing clock times and includes both repeated occurrences", () => {
    expect(bookingCandidates("2026-03-29", "Asia/Beirut", policy, Date.parse("2026-03-01T00:00Z"))).toHaveLength(23 * 4);
    const fall = bookingCandidates("2026-10-24", "Asia/Beirut", policy, Date.parse("2026-10-01T00:00Z"));
    expect(fall).toHaveLength(25 * 4);
    expect(fall).toContain(Date.parse("2026-10-24T20:30Z"));
    expect(fall).toContain(Date.parse("2026-10-24T21:30Z"));
  });
  it("compares the horizon in local time even when its boundary falls in a repeated hour", () => {
    const slots = bookingCandidates("2026-10-24", "Asia/Beirut", policy, Date.parse("2026-09-24T20:30Z"));
    expect(slots).toContain(Date.parse("2026-10-24T20:30Z"));
    expect(slots).toContain(Date.parse("2026-10-24T21:30Z"));
    expect(slots).not.toContain(Date.parse("2026-10-24T20:45Z"));
  });
  it("does not shift a horizon boundary that falls in a gap", () => {
    expect(bookingCandidates("2026-03-29", "Asia/Beirut", policy, Date.parse("2026-02-26T22:30Z"))).toEqual([]);
  });
  it("returns no candidates outside the horizon or when notice consumes the window", () => {
    const now = Date.parse("2026-07-01T06:00Z");
    expect(bookingCandidates("2026-08-01", "Asia/Beirut", policy, now)).toEqual([]);
    expect(bookingCandidates("2026-06-30", "Asia/Beirut", policy, now)).toEqual([]);
    expect(bookingCandidates("2026-07-01", "Asia/Beirut", { ...policy, minimumNoticeMinutes: 1440 }, now)).toEqual([]);
  });
  it.each([{ slotIntervalMinutes: 0 }, { slotIntervalMinutes: 1441 }, { minimumNoticeMinutes: -1 }, { bufferAfterMinutes: 1.5 }, { approvalMode: "UNKNOWN" }, { cancellationNoticeMinutes: NaN }])("rejects invalid policy %o", changes => {
    expect(() => validateBookingPolicy({ ...policy, ...changes } as BookingPolicy)).toThrow();
  });
  it("includes preceding and later schedule anchors and rejects unreasonable computation spans", () => {
    const dates = availabilityDates("2026-07-01", 60, "Asia/Beirut", Date.parse("2026-07-01T20:45Z"));
    expect(dates[0]).toBe("2026-06-30");
    expect(dates).toContain("2026-07-02");
    expect(() => availabilityDates("2026-07-01", 366 * 1440, "Asia/Beirut", Date.parse("2026-07-01T20:45Z"))).toThrow();
  });
});
