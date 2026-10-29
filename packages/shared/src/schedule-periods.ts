import type { DailyPeriod, WeeklySchedule, ScheduleOverride } from "./scheduling";

export interface SchedulePeriodInput {
  dayOfWeek: number;
  kind: "WORK" | "BREAK";
  startMinute: number;
  endMinute: number;
  startOccurrence: "earlier" | "later" | null;
  endOccurrence: "earlier" | "later" | null;
}

export function validateSchedulePeriod(input: SchedulePeriodInput): SchedulePeriodInput {
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 7 ||
    !["WORK", "BREAK"].includes(input.kind) || !Number.isInteger(input.startMinute) || !Number.isInteger(input.endMinute) ||
    input.startMinute < 0 || input.endMinute <= input.startMinute || input.endMinute >= 2880 ||
    (input.kind === "WORK" && input.startMinute >= 1440) ||
    ![null, "earlier", "later"].includes(input.startOccurrence) || ![null, "earlier", "later"].includes(input.endOccurrence)) throw new Error("Invalid schedule period");
  return { dayOfWeek: input.dayOfWeek, kind: input.kind, startMinute: input.startMinute, endMinute: input.endMinute, startOccurrence: input.startOccurrence, endOccurrence: input.endOccurrence };
}

export function scheduleClock(minute: number): string {
  const local = minute % 1440;
  return `${String(Math.floor(local / 60)).padStart(2, "0")}:${String(local % 60).padStart(2, "0")}`;
}

export function weeklyFromPeriods(inputs: readonly SchedulePeriodInput[]): WeeklySchedule[] {
  const days = new Map<number, { dayOfWeek: number; working: DailyPeriod[]; breaks: DailyPeriod[] }>();
  for (const raw of inputs) {
    const input = validateSchedulePeriod(raw);
    const day = days.get(input.dayOfWeek) ?? { dayOfWeek: input.dayOfWeek, working: [], breaks: [] };
    const period: DailyPeriod = {
      start: scheduleClock(input.startMinute), end: scheduleClock(input.endMinute),
      startDayOffset: input.startMinute >= 1440 ? 1 : 0, endDayOffset: input.endMinute >= 1440 ? 1 : 0,
      ...(input.startOccurrence ? { startOccurrence: input.startOccurrence } : {}),
      ...(input.endOccurrence ? { endOccurrence: input.endOccurrence } : {}),
    };
    (input.kind === "WORK" ? day.working : day.breaks).push(period);
    days.set(input.dayOfWeek, day);
  }
  return [...days.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/** One date replaces its entire weekly definition; an empty list means no shift starts. */
export function overrideFromPeriods(date: string, inputs: unknown): ScheduleOverride {
  if (!Array.isArray(inputs)) throw new Error("Invalid override periods");
  const periods = inputs.map(input => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid override period");
    const period = validateSchedulePeriod(input as SchedulePeriodInput);
    if (period.dayOfWeek !== 1) throw new Error("Override periods use a single date anchor");
    return period;
  });
  const day = weeklyFromPeriods(periods)[0];
  return { date, working: day?.working ?? [], breaks: day?.breaks ?? [] };
}
