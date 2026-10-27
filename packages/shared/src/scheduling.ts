import { Temporal } from "@js-temporal/polyfill";
import type { TimeInterval } from "./availability";

export interface LocalEndpoint {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  /** Required only when a clock time occurs twice; gaps are never shifted. */
  occurrence?: "earlier" | "later";
}
export interface LocalInterval { start: LocalEndpoint; end: LocalEndpoint; }
export interface DailyPeriod {
  start: string;
  end: string;
  /** Use 1 for a break starting after midnight within an overnight shift. */
  startDayOffset?: 0 | 1;
  /** Explicit overnight end, rather than inferring it from reversed clock times. */
  endDayOffset: 0 | 1;
  startOccurrence?: "earlier" | "later";
  endOccurrence?: "earlier" | "later";
}
export interface DaySchedule {
  working: readonly DailyPeriod[];
  breaks: readonly DailyPeriod[];
}
export interface WeeklySchedule extends DaySchedule { dayOfWeek: number; } // Monday=1, Sunday=7
export interface ScheduleOverride extends DaySchedule { date: string; }
export interface ScheduleRequest {
  barbershopId: string;
  barber: { id: string; barbershopId: string };
  timeZone: string;
  /** Dates on which shifts START. Include the previous date for overnight carry-in. */
  dates: readonly string[];
  weekly: readonly WeeklySchedule[];
  /** A date override replaces that date's entire weekly schedule, including breaks. */
  overrides: readonly ScheduleOverride[];
  timeOff: readonly LocalInterval[];
  closureDates: readonly string[];
}
export interface ResolvedSchedule {
  barberId: string;
  barbershopId: string;
  working: TimeInterval[];
  unavailable: TimeInterval[];
  closures: TimeInterval[];
}

export class LocalTimeError extends Error {
  constructor(public readonly code: "NONEXISTENT_TIME" | "AMBIGUOUS_TIME", public readonly endpoint: LocalEndpoint, timeZone: string) {
    super(`${code}: ${endpoint.date} ${endpoint.time} in ${timeZone}`);
    this.name = "LocalTimeError";
  }
}
function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date must use YYYY-MM-DD");
  return Temporal.PlainDate.from(value, { overflow: "reject" });
}
function time(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Time must use HH:mm");
  return Temporal.PlainTime.from(value);
}
function zone(value: string) {
  // Fixed offsets would lose daylight-saving rules. UTC is also a named zone.
  if (!value || /^[+\-\u2212]/.test(value)) throw new Error("A named timezone is required");
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value);
}
function occurrence(value: unknown) {
  if (value !== undefined && value !== "earlier" && value !== "later") throw new Error("Invalid occurrence choice");
}

/** Strict wall-clock conversion: never normalize invalid dates or shift DST gaps. */
export function resolveLocalInstant(endpoint: LocalEndpoint, timeZone: string): number {
  zone(timeZone);
  occurrence(endpoint.occurrence);
  const local = date(endpoint.date).toPlainDateTime(time(endpoint.time));
  const earlier = local.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  const later = local.toZonedDateTime(timeZone, { disambiguation: "later" });
  if (!earlier.toPlainDateTime().equals(local) || !later.toPlainDateTime().equals(local)) {
    throw new LocalTimeError("NONEXISTENT_TIME", endpoint, timeZone);
  }
  if (earlier.epochMilliseconds !== later.epochMilliseconds && endpoint.occurrence === undefined) {
    throw new LocalTimeError("AMBIGUOUS_TIME", endpoint, timeZone);
  }
  return (endpoint.occurrence === "later" ? later : earlier).epochMilliseconds;
}
export function resolveLocalInterval(interval: LocalInterval, timeZone: string): TimeInterval {
  const start = resolveLocalInstant(interval.start, timeZone);
  const end = resolveLocalInstant(interval.end, timeZone);
  if (end <= start) throw new Error("Interval end must follow start");
  return { start, end };
}

/** Calendar-day boundaries use the first existing instant, including midnight DST changes. */
export function resolveClosureDate(value: string, timeZone: string): TimeInterval {
  zone(timeZone);
  const day = date(value);
  const start = day.toZonedDateTime(timeZone);
  const end = day.add({ days: 1 }).toZonedDateTime(timeZone);
  if (!start.toPlainDate().equals(day) || end.epochMilliseconds <= start.epochMilliseconds) throw new Error("Local calendar date does not exist");
  return { start: start.epochMilliseconds, end: end.epochMilliseconds };
}
function validatePeriods(schedule: DaySchedule) {
  for (const period of [...schedule.working, ...schedule.breaks]) {
    time(period.start); time(period.end);
    if (period.startDayOffset !== undefined && period.startDayOffset !== 0 && period.startDayOffset !== 1) throw new Error("Invalid start day offset");
    if (period.endDayOffset !== 0 && period.endDayOffset !== 1) throw new Error("Invalid end day offset");
    occurrence(period.startOccurrence); occurrence(period.endOccurrence);
  }
}
function resolvePeriod(day: string, period: DailyPeriod, timeZone: string): TimeInterval {
  return resolveLocalInterval({
    start: { date: date(day).add({ days: period.startDayOffset ?? 0 }).toString(), time: period.start, ...(period.startOccurrence ? { occurrence: period.startOccurrence } : {}) },
    end: { date: date(day).add({ days: period.endDayOffset }).toString(), time: period.end, ...(period.endOccurrence ? { occurrence: period.endOccurrence } : {}) },
  }, timeZone);
}
const sorted = (intervals: TimeInterval[]) => intervals.sort((a, b) => a.start - b.start || a.end - b.end);

/** Pure expansion of one authorized barber's schedule; no identity, database or booking writes. */
export function resolveBarberSchedule(request: ScheduleRequest): ResolvedSchedule {
  if (!request.barbershopId.trim() || !request.barber.id.trim()) throw new Error("Shop and barber context are required");
  if (request.barber.barbershopId !== request.barbershopId) throw new Error("Cross-shop barber schedule");
  zone(request.timeZone);
  const weekly = new Map<number, WeeklySchedule>();
  for (const entry of request.weekly) {
    if (!Number.isInteger(entry.dayOfWeek) || entry.dayOfWeek < 1 || entry.dayOfWeek > 7 || weekly.has(entry.dayOfWeek)) throw new Error("Invalid or duplicate weekday");
    validatePeriods(entry); weekly.set(entry.dayOfWeek, entry);
  }
  const overrides = new Map<string, ScheduleOverride>();
  for (const entry of request.overrides) {
    date(entry.date); validatePeriods(entry);
    if (overrides.has(entry.date)) throw new Error("Duplicate schedule override");
    overrides.set(entry.date, entry);
  }
  const working: TimeInterval[] = [];
  const unavailable = request.timeOff.map(interval => resolveLocalInterval(interval, request.timeZone));
  for (const day of new Set(request.dates)) {
    const parsed = date(day);
    const schedule = overrides.get(day) ?? weekly.get(parsed.dayOfWeek);
    if (!schedule) continue;
    working.push(...schedule.working.map(period => resolvePeriod(day, period, request.timeZone)));
    unavailable.push(...schedule.breaks.map(period => resolvePeriod(day, period, request.timeZone)));
  }
  return {
    barbershopId: request.barbershopId, barberId: request.barber.id,
    working: sorted(working), unavailable: sorted(unavailable),
    closures: sorted([...new Set(request.closureDates)].map(day => resolveClosureDate(day, request.timeZone))),
  };
}
