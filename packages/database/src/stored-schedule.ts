import { resolveBarberSchedule, resolveClosureDate, weeklyFromPeriods, overrideFromPeriods, type SchedulePeriodInput } from "@barber/shared";
import type { Prisma } from "./generated/prisma/client";

/** Internal loader. Caller must authorize the shop/barber and provide canonical anchor dates. */
export async function loadStoredSchedule(tx: Prisma.TransactionClient, shopId: string, barberId: string, timeZone: string, dates: string[]) {
  const start = resolveClosureDate(dates[0]!, timeZone).start;
  const end = resolveClosureDate(dates.at(-1)!, timeZone).end;
  const dateFilter = { in: dates.map(day => new Date(`${day}T00:00:00.000Z`)) };
  const periods = await tx.barberSchedulePeriod.findMany({ where: { barbershopId: shopId, barberId } });
  const overrides = await tx.barberScheduleOverride.findMany({ where: { barbershopId: shopId, barberId, date: dateFilter } });
  const closures = await tx.shopClosure.findMany({ where: { barbershopId: shopId, date: dateFilter } });
  const resolved = resolveBarberSchedule({ barbershopId: shopId, barber: { id: barberId, barbershopId: shopId }, timeZone, dates,
    weekly: weeklyFromPeriods(periods as SchedulePeriodInput[]), overrides: overrides.map(row => overrideFromPeriods(row.date.toISOString().slice(0, 10), row.periods)),
    timeOff: [], closureDates: closures.map(row => row.date.toISOString().slice(0, 10)) });
  const timeOff = await tx.barberTimeOff.findMany({ where: { barbershopId: shopId, barberId, startsAt: { lt: new Date(end) }, endsAt: { gt: new Date(start) } } });
  return { ...resolved, unavailable: [...resolved.unavailable, ...timeOff.map(item => ({ start: item.startsAt.getTime(), end: item.endsAt.getTime() }))] };
}
