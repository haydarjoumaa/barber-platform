import { describe, expect, it } from "vitest";
import { validateSchedulePeriod, weeklyFromPeriods, overrideFromPeriods, type SchedulePeriodInput } from "./schedule-periods";
import { resolveBarberSchedule } from "./scheduling";

const period: SchedulePeriodInput = { dayOfWeek: 3, kind: "WORK", startMinute: 22 * 60, endMinute: 26 * 60, startOccurrence: null, endOccurrence: null };
describe("stored schedule periods", () => {
  it("preserves overnight shifts and after-midnight breaks through UTC expansion", () => {
    const weekly = weeklyFromPeriods([period, { ...period, kind: "BREAK", startMinute: 24 * 60 + 30, endMinute: 25 * 60 }]);
    const resolved = resolveBarberSchedule({ barbershopId: "shop", barber: { id: "barber", barbershopId: "shop" }, timeZone: "Asia/Beirut", dates: ["2026-07-01"], weekly, overrides: [], timeOff: [], closureDates: [] });
    expect(resolved.working).toEqual([{ start: Date.parse("2026-07-01T19:00Z"), end: Date.parse("2026-07-01T23:00Z") }]);
    expect(resolved.unavailable).toEqual([{ start: Date.parse("2026-07-01T21:30Z"), end: Date.parse("2026-07-01T22:00Z") }]);
  });
  it.each([{ dayOfWeek: 0 }, { dayOfWeek: 8 }, { startMinute: -1 }, { endMinute: 2880 }, { startMinute: 1440 }, { endMinute: 1320 }, { startMinute: 0.5 }, { kind: "INVALID" }, { startOccurrence: "auto" }])("rejects invalid stored values %o", change => {
    expect(() => validateSchedulePeriod({ ...period, ...change } as SchedulePeriodInput)).toThrow();
  });
  it("preserves explicit repeated-hour choices", () => {
    const weekly = weeklyFromPeriods([{ ...period, dayOfWeek: 6, startMinute: 23 * 60 + 30, endMinute: 25 * 60, startOccurrence: "later" }]);
    const resolved = resolveBarberSchedule({ barbershopId: "shop", barber: { id: "barber", barbershopId: "shop" }, timeZone: "Asia/Beirut", dates: ["2026-10-24"], weekly, overrides: [], timeOff: [], closureDates: [] });
    expect(resolved.working[0]!.start).toBe(Date.parse("2026-10-24T21:30Z"));
  });
  it("date replacements remove weekly breaks as well as shifts", () => {
    const override = overrideFromPeriods("2026-07-01", [{ ...period, dayOfWeek: 1, startMinute: 600, endMinute: 840 }]);
    const result = resolveBarberSchedule({ barbershopId: "shop", barber: { id: "barber", barbershopId: "shop" }, timeZone: "Asia/Beirut", dates: ["2026-07-01"], weekly: weeklyFromPeriods([period, { ...period, kind: "BREAK", startMinute: 1380, endMinute: 1410 }]), overrides: [override], timeOff: [], closureDates: [] });
    expect(result.working).toEqual([{ start: Date.parse("2026-07-01T07:00Z"), end: Date.parse("2026-07-01T11:00Z") }]);
    expect(result.unavailable).toEqual([]);
  });
  it("empty replacement keeps previous-day overnight carry-in, while a closure blocks the whole date", () => {
    const result = resolveBarberSchedule({ barbershopId: "shop", barber: { id: "barber", barbershopId: "shop" }, timeZone: "Asia/Beirut", dates: ["2026-07-01", "2026-07-02"], weekly: weeklyFromPeriods([period, { ...period, dayOfWeek: 4 }]), overrides: [overrideFromPeriods("2026-07-02", [])], timeOff: [], closureDates: ["2026-07-02"] });
    expect(result.working).toHaveLength(1);
    expect(result.working[0]!.end).toBe(Date.parse("2026-07-01T23:00Z"));
    expect(result.closures).toEqual([{ start: Date.parse("2026-07-01T21:00Z"), end: Date.parse("2026-07-02T21:00Z") }]);
  });
  it.each([null, {}, [null], ["bad"], [{ ...period, dayOfWeek: 2 }], [{ ...period, dayOfWeek: 1, endMinute: -1 }]])("rejects malformed override payload %o", payload => {
    expect(() => overrideFromPeriods("2026-07-01", payload)).toThrow();
  });
});
