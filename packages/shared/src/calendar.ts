import { Temporal } from "@js-temporal/polyfill";

export type CalendarView = "day" | "week" | "month";

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
