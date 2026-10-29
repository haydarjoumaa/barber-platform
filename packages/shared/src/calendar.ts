import { Temporal } from "@js-temporal/polyfill";
import { resolveClosureDate } from "./scheduling";

export type CalendarView = "day" | "week" | "month";

/** Inclusive local dates with an exclusive UTC end; DST days need not be 24 hours. */
export function calendarRange(date: string, view: CalendarView, timeZone: string) {
  if (!["day", "week", "month"].includes(view)) throw new Error("Invalid calendar view");
  const dates = calendarDates(date, view);
  const days = dates.map(date => ({ date, ...resolveClosureDate(date, timeZone) }));
  return { dates, days, start: days[0]!.start, end: days.at(-1)!.end };
}

/** Calendar navigation uses local dates, never fixed 24-hour millisecond steps. */
export function shiftCalendarDate(date: string, view: CalendarView, direction: -1 | 1): string {
  return Temporal.PlainDate.from(date).add(view === "month" ? { months: direction } : { days: direction * (view === "week" ? 7 : 1) }).toString();
}

/** Monday-first date grids; a month includes surrounding dates to complete its weeks. */
export function calendarDates(date: string, view: CalendarView): string[] {
  const selected = Temporal.PlainDate.from(date);
  if (view === "day") return [selected.toString()];
  const anchor = view === "month" ? selected.with({ day: 1 }) : selected;
  const start = anchor.subtract({ days: anchor.dayOfWeek - 1 });
  const count = view === "week" ? 7 : Math.ceil((anchor.dayOfWeek - 1 + anchor.daysInMonth) / 7) * 7;
  return Array.from({ length: count }, (_, index) => start.add({ days: index }).toString());
}

export function shopCalendarDate(now: Date, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}
