import { validateSchedulePeriod, type LocalEndpoint, type LocalInterval, type SchedulePeriodInput } from "@barber/shared";

export const scheduleField = (form: FormData, key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
function occurrence(value: string): "earlier" | "later" | null {
  if (value === "") return null;
  if (value !== "earlier" && value !== "later") throw new Error("Invalid occurrence");
  return value;
}
function minute(form: FormData, prefix: string) {
  const value = scheduleField(form, `${prefix}Time`);
  const offset = scheduleField(form, `${prefix}Offset`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value) || !["0", "1"].includes(offset)) throw new Error("Invalid time");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) + Number(offset) * 1440;
}
export function periodFromForm(form: FormData): SchedulePeriodInput {
  const weekday = scheduleField(form, "dayOfWeek");
  const kind = scheduleField(form, "kind");
  if (!/^[1-7]$/.test(weekday) || (kind !== "WORK" && kind !== "BREAK")) throw new Error("Invalid period");
  return validateSchedulePeriod({ dayOfWeek: Number(weekday), kind, startMinute: minute(form, "start"), endMinute: minute(form, "end"),
    startOccurrence: occurrence(scheduleField(form, "startOccurrence")), endOccurrence: occurrence(scheduleField(form, "endOccurrence")) });
}
export function timeOffFromForm(form: FormData): LocalInterval {
  function endpoint(prefix: string): LocalEndpoint {
    const choice = occurrence(scheduleField(form, `${prefix}Occurrence`));
    return { date: scheduleField(form, `${prefix}Date`), time: scheduleField(form, `${prefix}Time`), ...(choice ? { occurrence: choice } : {}) };
  }
  return { start: endpoint("start"), end: endpoint("end") };
}
