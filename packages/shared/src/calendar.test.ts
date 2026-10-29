import { expect, it } from "vitest";
import { calendarDates, calendarRange, shiftCalendarDate, shopCalendarDate, type CalendarView } from "./calendar";

it("builds complete Monday-first weeks across year boundaries", () => {
  expect(calendarDates("2027-01-01", "week")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
});
it("covers leap days and six-week months without missing or duplicate dates", () => {
  const leap = calendarDates("2028-02-10", "month");
  expect(leap).toContain("2028-02-29");
  const sixWeeks = calendarDates("2026-03-01", "month");
  expect(sixWeeks).toHaveLength(42);
  expect(sixWeeks[0]).toBe("2026-02-23");
  expect(sixWeeks.at(-1)).toBe("2026-04-05");
  expect(new Set(sixWeeks).size).toBe(sixWeeks.length);
});
it("constrains month ends and navigates calendar days across Beirut DST", () => {
  expect(shiftCalendarDate("2026-01-31", "month", 1)).toBe("2026-02-28");
  expect(shiftCalendarDate("2026-03-29", "day", -1)).toBe("2026-03-28");
  expect(shiftCalendarDate("2026-10-25", "week", 1)).toBe("2026-11-01");
  expect(shopCalendarDate(new Date("2026-03-28T22:30:00Z"), "Asia/Beirut")).toBe("2026-03-29");
  expect(shopCalendarDate(new Date("2026-10-24T21:30:00Z"), "Asia/Beirut")).toBe("2026-10-24");
});

it("uses contiguous UTC boundaries across Beirut's short and long weeks", () => {
  for (const [date, hours] of [["2026-03-29", 167], ["2026-10-25", 169]] as const) {
    const range = calendarRange(date, "week", "Asia/Beirut");
    expect(range.dates).toHaveLength(7);
    expect((range.end - range.start) / 3_600_000).toBe(hours);
    range.days.slice(1).forEach((day, index) => expect(day.start).toBe(range.days[index]!.end));
  }
});

it("bounds a full month grid and rejects invalid ranges", () => {
  const range = calendarRange("2026-03-15", "month", "Asia/Beirut");
  expect(range.days).toHaveLength(42);
  expect(range.dates[0]).toBe("2026-02-23");
  expect(range.dates.at(-1)).toBe("2026-04-05");
  expect(() => calendarRange("bad", "week", "Asia/Beirut")).toThrow();
  expect(() => calendarRange("2026-03-15", "year" as CalendarView, "Asia/Beirut")).toThrow();
  expect(() => calendarRange("2026-03-15", "day", "Invalid/Zone")).toThrow();
});
