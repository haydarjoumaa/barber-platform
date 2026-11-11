import { shopCalendarDate } from "./calendar";
import { resolveClosureDate } from "./scheduling";

const MINUTE = 60_000;

/** Candidate starts for a walk-in: every minute from now (rounded up) to the end of the shop-local day.
 * Walk-ins skip the slot grid and minimum notice; schedules, closures and other bookings still apply.
 */
export function walkInStarts(now: number, timeZone: string): { date: string; starts: number[] } {
  if (!Number.isSafeInteger(now)) throw new Error("Invalid clock");
  const date = shopCalendarDate(new Date(now), timeZone);
  const { end } = resolveClosureDate(date, timeZone);
  const starts: number[] = [];
  for (let start = Math.ceil(now / MINUTE) * MINUTE; start < end; start += MINUTE) starts.push(start);
  return { date, starts };
}
