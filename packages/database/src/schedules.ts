import { loadStoredSchedule } from "./stored-schedule";
import type { StaffPrincipal } from "@barber/auth";
import { resolveBarberSchedule, resolveClosureDate, resolveLocalInterval, shiftCalendarDate, validateSchedulePeriod, overrideFromPeriods, type LocalInterval, type SchedulePeriodInput } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { withStaffAccess } from "./staff-access";
import { withShopOwner } from "./owner-transaction";

export function createBarberSchedules(database: PrismaClient) {
  function authorized<T>(principal: StaffPrincipal | null, shopId: string, barberId: string,
    operation: (tx: Prisma.TransactionClient, timeZone: string, actor: string) => Promise<T>) {
    return withStaffAccess(database, principal, shopId, "schedules", async (tx, shop, actor, access) => {
      if (access.barberId && barberId !== access.barberId) throw new Error("Forbidden");
      if (!await tx.barber.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id: barberId } } })) throw new Error("Barber not found");
      return operation(tx, shop.time_zone, actor);
    });
  }
  function audit(tx: Prisma.TransactionClient, barbershopId: string, actorUserId: string, event: string, details: Prisma.InputJsonObject) {
    return tx.auditEvent.create({ data: { barbershopId, actorUserId, event, details } });
  }
  return {
    list(principal: StaffPrincipal | null, shopId: string, barberId: string) {
      return authorized(principal, shopId, barberId, async (tx, timeZone) => ({
        timeZone,
        periods: await tx.barberSchedulePeriod.findMany({ where: { barbershopId: shopId, barberId }, orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }, { id: "asc" }] }),
        timeOff: await tx.barberTimeOff.findMany({ where: { barbershopId: shopId, barberId }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }),
        overrides: await tx.barberScheduleOverride.findMany({ where: { barbershopId: shopId, barberId }, orderBy: { date: "asc" } }),
        closures: await tx.shopClosure.findMany({ where: { barbershopId: shopId }, orderBy: { date: "asc" } }),
      }));
    },
    addPeriod(principal: StaffPrincipal | null, shopId: string, barberId: string, input: SchedulePeriodInput) {
      return authorized(principal, shopId, barberId, async (tx, _zone, actor) => {
        const data = validateSchedulePeriod(input);
        const duplicate = await tx.barberSchedulePeriod.findFirst({ where: { barbershopId: shopId, barberId, ...data } });
        if (duplicate) throw new Error("Period already exists");
        const row = await tx.barberSchedulePeriod.create({ data: { barbershopId: shopId, barberId, ...data } });
        await audit(tx, shopId, actor, "schedule.period_added", { barberId, periodId: row.id, ...data });
        return row;
      });
    },
    addTimeOff(principal: StaffPrincipal | null, shopId: string, barberId: string, interval: LocalInterval) {
      return authorized(principal, shopId, barberId, async (tx, timeZone, actor) => {
        const resolved = resolveLocalInterval(interval, timeZone);
        const data = { startsAt: new Date(resolved.start), endsAt: new Date(resolved.end) };
        const row = await tx.barberTimeOff.create({ data: { barbershopId: shopId, barberId, ...data } });
        await audit(tx, shopId, actor, "schedule.time_off_added", { barberId, timeOffId: row.id, startsAt: data.startsAt.toISOString(), endsAt: data.endsAt.toISOString(), timeZone });
        return row;
      });
    },
    remove(principal: StaffPrincipal | null, shopId: string, barberId: string, id: string, kind: "period" | "timeOff" | "override") {
      return authorized(principal, shopId, barberId, async (tx, _zone, actor) => {
        const where = { barbershopId: shopId, barberId, id };
        if (kind !== "period" && kind !== "timeOff" && kind !== "override") throw new Error("Invalid removal");
        const result = kind === "period" ? await tx.barberSchedulePeriod.deleteMany({ where }) : kind === "override" ? await tx.barberScheduleOverride.deleteMany({ where }) : await tx.barberTimeOff.deleteMany({ where });
        if (!result.count) throw new Error("Schedule record not found");
        await audit(tx, shopId, actor, "schedule.record_removed", { barberId, id, kind });
      });
    },
    saveOverride(principal: StaffPrincipal | null, shopId: string, barberId: string, date: string, input: unknown) {
      return authorized(principal, shopId, barberId, async (tx, timeZone, actor) => {
        resolveClosureDate(date, timeZone);
        const override = overrideFromPeriods(date, input);
        // Validate actual date/DST behavior before persisting any replacement.
        resolveBarberSchedule({ barbershopId: shopId, barber: { id: barberId, barbershopId: shopId }, timeZone, dates: [date], weekly: [], overrides: [override], timeOff: [], closureDates: [] });
        const periods = (input as SchedulePeriodInput[]).map(item => ({ ...validateSchedulePeriod(item) }));
        const storedDate = new Date(`${date}T00:00:00.000Z`);
        const where = { barbershopId_barberId_date: { barbershopId: shopId, barberId, date: storedDate } };
        const previous = await tx.barberScheduleOverride.findUnique({ where });
        const row = await tx.barberScheduleOverride.upsert({ where, create: { barbershopId: shopId, barberId, date: storedDate, periods }, update: { periods } });
        await audit(tx, shopId, actor, "schedule.override_saved", { barberId, overrideId: row.id, date, before: previous?.periods ?? null, after: periods });
        return row;
      });
    },
    listClosures(principal: StaffPrincipal | null, shopId: string) {
      return withShopOwner(database, principal, shopId, async (tx, shop) => ({ timeZone: shop.time_zone, closures: await tx.shopClosure.findMany({ where: { barbershopId: shopId }, orderBy: { date: "asc" } }) }));
    },
    addClosure(principal: StaffPrincipal | null, shopId: string, date: string) {
      return withShopOwner(database, principal, shopId, async (tx, shop, actor) => {
        resolveClosureDate(date, shop.time_zone);
        const row = await tx.shopClosure.create({ data: { barbershopId: shopId, date: new Date(`${date}T00:00:00.000Z`) } });
        await audit(tx, shopId, actor, "schedule.closure_added", { closureId: row.id, date });
        return row;
      });
    },
    removeClosure(principal: StaffPrincipal | null, shopId: string, id: string) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actor) => {
        const existing = await tx.shopClosure.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id } } });
        if (!existing) throw new Error("Closure not found");
        await tx.shopClosure.delete({ where: { barbershopId_id: { barbershopId: shopId, id } } });
        await audit(tx, shopId, actor, "schedule.closure_removed", { closureId: id, date: existing.date.toISOString().slice(0, 10) });
      });
    },
    preview(principal: StaffPrincipal | null, shopId: string, barberId: string, date: string) {
      return authorized(principal, shopId, barberId, async (tx, timeZone) => {
        const window = resolveClosureDate(date, timeZone);
        const resolved = await loadStoredSchedule(tx, shopId, barberId, timeZone, [shiftCalendarDate(date, "day", -1), date]);
        const clip = (intervals: { start: number; end: number }[]) => intervals.filter(item => item.start < window.end && item.end > window.start)
          .map(item => ({ start: Math.max(item.start, window.start), end: Math.min(item.end, window.end) })).sort((a, b) => a.start - b.start);
        return { date, timeZone, working: clip(resolved.working), unavailable: clip([...resolved.unavailable, ...resolved.closures]) };
      });
    },
  };
}
