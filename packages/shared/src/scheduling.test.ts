import { describe, expect, it } from "vitest";
import { findAvailableSlots } from "./availability";
import { LocalTimeError, resolveBarberSchedule, resolveClosureDate, resolveLocalInstant, resolveLocalInterval, type ScheduleRequest } from "./scheduling";

const zone = "Asia/Beirut";
const utc = (value: string) => Date.parse(value);
const endpoint = (date: string, time: string) => ({ date, time });
function schedule(): ScheduleRequest {
  return {
    barbershopId: "shop-a", barber: { id: "barber-a", barbershopId: "shop-a" }, timeZone: zone,
    dates: ["2026-07-01"], // Wednesday
    weekly: [{ dayOfWeek: 3, working: [{ start: "09:00", end: "17:00", endDayOffset: 0 }], breaks: [{ start: "12:00", end: "13:00", endDayOffset: 0 }] }],
    overrides: [], timeOff: [], closureDates: [],
  };
}

describe("local time conversion", () => {
  it("uses Beirut winter/summer rules rather than the machine timezone", () => {
    expect(resolveLocalInstant(endpoint("2026-01-15", "09:00"), zone)).toBe(utc("2026-01-15T07:00:00Z"));
    expect(resolveLocalInstant(endpoint("2026-07-15", "09:00"), zone)).toBe(utc("2026-07-15T06:00:00Z"));
  });
  it.each([undefined, "earlier", "later"] as const)("never shifts a nonexistent spring time, even with %s", occurrence => {
    const local = { ...endpoint("2026-03-29", "00:30"), ...(occurrence ? { occurrence } : {}) };
    expect(() => resolveLocalInstant(local, zone)).toThrow(LocalTimeError);
    expect(() => resolveLocalInstant(local, zone)).toThrow("NONEXISTENT_TIME");
  });
  it("requires a choice for the repeated Beirut autumn hour", () => {
    const local = endpoint("2026-10-24", "23:30");
    expect(() => resolveLocalInstant(local, zone)).toThrow("AMBIGUOUS_TIME");
    const earlier = resolveLocalInstant({ ...local, occurrence: "earlier" }, zone);
    const later = resolveLocalInstant({ ...local, occurrence: "later" }, zone);
    expect(earlier).toBe(utc("2026-10-24T20:30:00Z"));
    expect(later).toBe(utc("2026-10-24T21:30:00Z"));
    expect(later - earlier).toBe(3_600_000);
  });
  it("validates interval ordering by instant, including repeated wall times", () => {
    const local = endpoint("2026-10-24", "23:30");
    const interval = resolveLocalInterval({ start: { ...local, occurrence: "earlier" }, end: { ...local, occurrence: "later" } }, zone);
    expect(interval.end - interval.start).toBe(3_600_000);
    expect(() => resolveLocalInterval({ start: { ...local, occurrence: "later" }, end: { ...local, occurrence: "earlier" } }, zone)).toThrow("end must follow start");
  });
  it.each(["2026-02-30", "2026-7-1", "2026-07-01T09:00Z"])("rejects invalid/noncanonical dates %s", date => {
    expect(() => resolveLocalInstant(endpoint(date, "09:00"), zone)).toThrow();
  });
  it.each(["24:00", "09:60", "9:00", "09:00+03:00"])("rejects invalid/noncanonical times %s", time => {
    expect(() => resolveLocalInstant(endpoint("2026-07-01", time), zone)).toThrow();
  });
  it.each(["", "+02:00", "Not/AZone"])("rejects missing, fixed-offset or unknown zones %s", invalidZone => {
    expect(() => resolveLocalInstant(endpoint("2026-07-01", "09:00"), invalidZone)).toThrow();
  });
});

describe("local-day closures", () => {
  it.each([["2026-03-29", 23], ["2026-10-24", 25], ["2026-07-01", 24]] as const)("covers all of %s (%s hours)", (day, hours) => {
    const result = resolveClosureDate(day, zone);
    expect(result.end - result.start).toBe(hours * 3_600_000);
  });
  it("starts a spring closure at the first existing local time", () => {
    expect(resolveClosureDate("2026-03-29", zone)).toEqual({ start: utc("2026-03-28T22:00:00Z"), end: utc("2026-03-29T21:00:00Z") });
  });
  it("rejects a wholly skipped calendar date", () => {
    expect(() => resolveClosureDate("2011-12-30", "Pacific/Apia")).toThrow("does not exist");
  });
});

describe("weekly schedule expansion", () => {
  it("resolves working hours and breaks, independently of input ordering", () => {
    const input = schedule(); input.dates = ["2026-07-08", "2026-07-01", "2026-07-01"];
    const result = resolveBarberSchedule(input);
    expect(result.working).toEqual([
      { start: utc("2026-07-01T06:00:00Z"), end: utc("2026-07-01T14:00:00Z") },
      { start: utc("2026-07-08T06:00:00Z"), end: utc("2026-07-08T14:00:00Z") },
    ]);
    expect(result.unavailable[0]).toEqual({ start: utc("2026-07-01T09:00:00Z"), end: utc("2026-07-01T10:00:00Z") });
  });
  it("replaces the entire day including breaks and supports a temporary day off", () => {
    const input = schedule();
    input.overrides = [{ date: "2026-07-01", working: [{ start: "10:00", end: "14:00", endDayOffset: 0 }], breaks: [] }];
    const result = resolveBarberSchedule(input);
    expect(result.working).toEqual([{ start: utc("2026-07-01T07:00:00Z"), end: utc("2026-07-01T11:00:00Z") }]);
    expect(result.unavailable).toEqual([]);
    input.overrides = [{ date: "2026-07-01", working: [], breaks: [] }];
    expect(resolveBarberSchedule(input).working).toEqual([]);
  });
  it("supports explicit overnight shifts and time off across dates", () => {
    const input = schedule();
    input.weekly = [{ dayOfWeek: 3, working: [{ start: "22:00", end: "02:00", endDayOffset: 1 }], breaks: [] }];
    input.timeOff = [{ start: endpoint("2026-07-01", "23:00"), end: endpoint("2026-07-02", "01:00") }];
    const result = resolveBarberSchedule(input);
    expect(result.working).toEqual([{ start: utc("2026-07-01T19:00:00Z"), end: utc("2026-07-01T23:00:00Z") }]);
    expect(result.unavailable).toEqual([{ start: utc("2026-07-01T20:00:00Z"), end: utc("2026-07-01T22:00:00Z") }]);
  });
  it("rejects cross-shop context, duplicate weekdays and conflicting overrides", () => {
    const input = schedule();
    expect(() => resolveBarberSchedule({ ...input, barbershopId: "shop-b" })).toThrow("Cross-shop");
    expect(() => resolveBarberSchedule({ ...input, weekly: [...input.weekly, ...input.weekly] })).toThrow("weekday");
    const override = { date: "2026-07-01", working: [], breaks: [] };
    expect(() => resolveBarberSchedule({ ...input, overrides: [override, override] })).toThrow("Duplicate schedule override");
  });
  it("fails the whole resolution for a DST ambiguity rather than emitting a partial schedule", () => {
    const input = schedule();
    input.dates = ["2026-03-29"];
    input.overrides = [{ date: "2026-03-29", working: [{ start: "00:30", end: "03:00", endDayOffset: 0 }], breaks: [] }];
    expect(() => resolveBarberSchedule(input)).toThrow("NONEXISTENT_TIME");
  });
  it("composes with availability to exclude breaks, time off and closures", () => {
    const input = schedule();
    input.timeOff = [{ start: endpoint("2026-07-01", "14:00"), end: endpoint("2026-07-01", "15:00") }];
    const resolved = resolveBarberSchedule(input);
    const candidates = ["08:00", "09:00", "10:00", "11:00"].map(time => utc(`2026-07-01T${time}:00Z`));
    const availability = {
      barbershopId: input.barbershopId,
      services: [{ id: "cut", barbershopId: input.barbershopId, durationMinutes: 30, priceMinor: 1000 }],
      selectedServiceIds: ["cut"], barbers: [{ id: input.barber.id, barbershopId: input.barbershopId, services: [{ serviceId: "cut" }], working: resolved.working, unavailable: resolved.unavailable }],
      candidateStarts: candidates, earliestStart: candidates[0]!, latestStart: candidates.at(-1)!, bufferAfterMinutes: 0, closures: resolved.closures,
    };
    expect(findAvailableSlots(availability).map(slot => slot.start)).toEqual([candidates[0], candidates[2]]);
    expect(findAvailableSlots({ ...availability, closures: [resolveClosureDate("2026-07-01", zone)] })).toEqual([]);
  });
});

it("resolves next-day breaks and blocks appointments carrying into a closure", () => {
  const input = schedule();
  input.weekly = [{ dayOfWeek: 3, working: [{ start: "22:00", end: "02:00", endDayOffset: 1 }], breaks: [{ start: "00:30", end: "01:00", startDayOffset: 1, endDayOffset: 1 }] }];
  input.closureDates = ["2026-07-02"];
  const resolved = resolveBarberSchedule(input);
  expect(resolved.unavailable).toEqual([{ start: utc("2026-07-01T21:30:00Z"), end: utc("2026-07-01T22:00:00Z") }]);
  const slots = findAvailableSlots({
    barbershopId: input.barbershopId,
    services: [{ id: "cut", barbershopId: input.barbershopId, durationMinutes: 30, priceMinor: 1000 }],
    selectedServiceIds: ["cut"],
    barbers: [{ id: input.barber.id, barbershopId: input.barbershopId, services: [{ serviceId: "cut" }], working: resolved.working, unavailable: resolved.unavailable }],
    candidateStarts: [utc("2026-07-01T20:30:00Z"), utc("2026-07-01T20:45:00Z")],
    earliestStart: utc("2026-07-01T19:00:00Z"), latestStart: utc("2026-07-01T23:00:00Z"), bufferAfterMinutes: 0, closures: resolved.closures,
  });
  expect(slots.map(slot => slot.start)).toEqual([utc("2026-07-01T20:30:00Z")]);
});
