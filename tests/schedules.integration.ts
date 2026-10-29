import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import type { SchedulePeriodInput } from "@barber/shared";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createBarberSchedules } from "../packages/database/src/schedules";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL to a migrated local development database");
const database = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const schedules = createBarberSchedules(database);
const shopA = randomUUID(), shopB = randomUUID(), userId = randomUUID();
const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopA, role: "OWNER" }] };
const period: SchedulePeriodInput = { dayOfWeek: 3, kind: "WORK", startMinute: 1320, endMinute: 1560, startOccurrence: null, endOccurrence: null };

test("persisted schedules enforce owner and tenant boundaries and retain Beirut semantics", { timeout: 30_000 }, async t => {
  const where = { barbershopId: { in: [shopA, shopB] } };
  try {
    await database.barbershop.createMany({ data: [{ id: shopA, name: "Schedule A", slug: `schedule-${shopA}` }, { id: shopB, name: "Schedule B", slug: `schedule-${shopB}` }] });
    await database.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const memberA = await database.shopMembership.create({ data: { barbershopId: shopA, userId, role: "OWNER" } });
    const memberB = await database.shopMembership.create({ data: { barbershopId: shopB, userId, role: "OWNER" } });
    const barberA = await database.barber.create({ data: { barbershopId: shopA, membershipId: memberA.id, displayName: "A" } });
    const barberB = await database.barber.create({ data: { barbershopId: shopB, membershipId: memberB.id, displayName: "B" } });
    t.beforeEach(async () => {
      await database.barberScheduleOverride.deleteMany({ where });
      await database.shopClosure.deleteMany({ where });
      await database.appointment.deleteMany({ where });
      await database.barberSchedulePeriod.deleteMany({ where });
      await database.barberTimeOff.deleteMany({ where });
      await database.auditEvent.deleteMany({ where });
      await database.shopMembership.update({ where: { id: memberA.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: null } });
    });
    await t.test("owner authorization is refreshed and cross-shop references fail", async () => {
      await assert.rejects(schedules.addPeriod(null, shopA, barberA.id, period), /Forbidden/);
      await assert.rejects(schedules.addPeriod(principal, shopA, barberB.id, period), /Barber not found/);
      await assert.rejects(schedules.list(principal, shopB, barberB.id), /Forbidden/);
      await assert.rejects(database.barberSchedulePeriod.create({ data: { barbershopId: shopA, barberId: barberB.id, ...period } }), { code: "P2003" });
      await assert.rejects(database.barberTimeOff.create({ data: { barbershopId: shopA, barberId: barberB.id, startsAt: new Date("2026-07-01T00:00Z"), endsAt: new Date("2026-07-02T00:00Z") } }), { code: "P2003" });
      await database.shopMembership.update({ where: { id: memberA.id }, data: { role: "BARBER" } });
      await assert.rejects(schedules.addPeriod(principal, shopA, barberA.id, period), /Forbidden/);
      await database.shopMembership.update({ where: { id: memberA.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(schedules.preview(principal, shopA, barberA.id, "2026-07-02"), /Forbidden/);
    });
    await t.test("database constraints reject invalid intervals without application validation", async () => {
      await assert.rejects(database.barberSchedulePeriod.create({ data: { barbershopId: shopA, barberId: barberA.id, ...period, endMinute: 1200 } }));
      await assert.rejects(database.barberSchedulePeriod.create({ data: { barbershopId: shopA, barberId: barberA.id, ...period, dayOfWeek: 8 } }));
      await assert.rejects(database.barberTimeOff.create({ data: { barbershopId: shopA, barberId: barberA.id, startsAt: new Date("2026-07-02T00:00Z"), endsAt: new Date("2026-07-01T00:00Z") } }));
    });
    await t.test("concurrent duplicate periods produce one row and one audit event", async () => {
      const results = await Promise.allSettled([schedules.addPeriod(principal, shopA, barberA.id, period), schedules.addPeriod(principal, shopA, barberA.id, period)]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(await database.barberSchedulePeriod.count({ where }), 1);
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "schedule.period_added" } }), 1);
    });
    await t.test("overnight carry-in, breaks and stored UTC time off compose", async () => {
      await schedules.addPeriod(principal, shopA, barberA.id, period);
      await schedules.addPeriod(principal, shopA, barberA.id, { ...period, kind: "BREAK", startMinute: 1470, endMinute: 1500 });
      const leave = await schedules.addTimeOff(principal, shopA, barberA.id, { start: { date: "2026-07-02", time: "01:00" }, end: { date: "2026-07-02", time: "01:30" } });
      assert.equal(leave.startsAt.toISOString(), "2026-07-01T22:00:00.000Z");
      const preview = await schedules.preview(principal, shopA, barberA.id, "2026-07-02");
      assert.deepEqual(preview.working, [{ start: Date.parse("2026-07-01T21:00Z"), end: Date.parse("2026-07-01T23:00Z") }]);
      assert.deepEqual(preview.unavailable, [{ start: Date.parse("2026-07-01T21:30Z"), end: Date.parse("2026-07-01T22:00Z") }, { start: Date.parse("2026-07-01T22:00Z"), end: Date.parse("2026-07-01T22:30Z") }]);
      await assert.rejects(schedules.remove(principal, shopA, barberA.id, randomUUID(), "timeOff"), /Schedule record not found/);
      await schedules.remove(principal, shopA, barberA.id, leave.id, "timeOff");
      assert.equal((await schedules.list(principal, shopA, barberA.id)).timeOff.length, 0);
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "schedule.record_removed" } }), 1);
    });
    await t.test("DST gaps and repeats require valid explicit input and never partially write", async () => {
      await assert.rejects(schedules.addTimeOff(principal, shopA, barberA.id, { start: { date: "2026-03-29", time: "00:30" }, end: { date: "2026-03-29", time: "02:00" } }), { code: "NONEXISTENT_TIME" });
      await assert.rejects(schedules.addTimeOff(principal, shopA, barberA.id, { start: { date: "2026-10-24", time: "23:30" }, end: { date: "2026-10-25", time: "01:00" } }), { code: "AMBIGUOUS_TIME" });
      assert.equal(await database.barberTimeOff.count({ where }), 0);
      assert.equal(await database.auditEvent.count({ where }), 0);
      const leave = await schedules.addTimeOff(principal, shopA, barberA.id, { start: { date: "2026-10-24", time: "23:30", occurrence: "later" }, end: { date: "2026-10-25", time: "01:00" } });
      assert.equal(leave.startsAt.toISOString(), "2026-10-24T21:30:00.000Z");
    });
    await t.test("date replacements are atomic, tenant scoped and reversible", async () => {
      await schedules.addPeriod(principal, shopA, barberA.id, period);
      const date = "2026-07-01";
      await assert.rejects(schedules.saveOverride(principal, shopA, barberB.id, date, []), /Barber not found/);
      await assert.rejects(schedules.saveOverride(principal, shopA, barberA.id, "2026-02-30", []));
      await assert.rejects(schedules.saveOverride(principal, shopA, barberA.id, date, [null]));
      const row = await schedules.saveOverride(principal, shopA, barberA.id, date, []);
      assert.deepEqual((await schedules.preview(principal, shopA, barberA.id, date)).working, []);
      const replacement = { ...period, dayOfWeek: 1, startMinute: 600, endMinute: 840 };
      await schedules.saveOverride(principal, shopA, barberA.id, date, [replacement]);
      assert.equal(await database.barberScheduleOverride.count({ where }), 1);
      assert.deepEqual((await schedules.preview(principal, shopA, barberA.id, date)).working, [{ start: Date.parse("2026-07-01T07:00Z"), end: Date.parse("2026-07-01T11:00Z") }]);
      await assert.rejects(schedules.saveOverride(principal, shopA, barberA.id, "2026-03-29", [{ ...replacement, startMinute: 30, endMinute: 120 }]), { code: "NONEXISTENT_TIME" });
      assert.equal(await database.barberScheduleOverride.count({ where }), 1);
      await assert.rejects(database.barberScheduleOverride.create({ data: { barbershopId: shopA, barberId: barberB.id, date: new Date("2026-07-01T00:00Z"), periods: [] } }), { code: "P2003" });
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "schedule.override_saved" } }), 2);
      await schedules.remove(principal, shopA, barberA.id, row.id, "override");
      assert.equal((await schedules.preview(principal, shopA, barberA.id, date)).working[0]!.start, Date.parse("2026-07-01T19:00Z"));
    });
    await t.test("shop closures span DST days, preserve bookings and reject cross-shop removal", async () => {
      for (const [date, hours] of [["2026-03-29", 23], ["2026-10-24", 25]] as const) {
        const closure = await schedules.addClosure(principal, shopA, date);
        const preview = await schedules.preview(principal, shopA, barberA.id, date);
        assert.equal(preview.unavailable.length, 1);
        assert.equal(preview.unavailable[0]!.end - preview.unavailable[0]!.start, hours * 60 * 60_000);
        await schedules.removeClosure(principal, shopA, closure.id);
      }
      const foreign = await database.shopClosure.create({ data: { barbershopId: shopB, date: new Date("2026-07-02T00:00Z") } });
      await assert.rejects(schedules.removeClosure(principal, shopA, foreign.id), /Closure not found/);
      await assert.rejects(schedules.addClosure(principal, shopB, "2026-07-02"), /Forbidden/);
      await assert.rejects(schedules.listClosures(null, shopA), /Forbidden/);
      await schedules.addPeriod(principal, shopA, barberA.id, period);
      const appointment = await database.appointment.create({ data: { barbershopId: shopA, barberId: barberA.id, status: "CONFIRMED", startsAt: new Date("2026-07-01T21:00Z"), serviceEndsAt: new Date("2026-07-01T21:30Z"), occupiedUntil: new Date("2026-07-01T21:30Z") } });
      const attempts = await Promise.allSettled([schedules.addClosure(principal, shopA, "2026-07-02"), schedules.addClosure(principal, shopA, "2026-07-02")]);
      assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
      const preview = await schedules.preview(principal, shopA, barberA.id, "2026-07-02");
      assert.equal(preview.working.length, 1);
      assert.equal(preview.unavailable[0]!.start, Date.parse("2026-07-01T21:00Z"));
      assert.equal(preview.unavailable[0]!.end, Date.parse("2026-07-02T21:00Z"));
      assert.equal((await database.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status, "CONFIRMED");
      assert.deepEqual((await schedules.listClosures(principal, shopA)).closures.map(row => row.date.toISOString().slice(0, 10)), ["2026-07-02"]);
      await database.shopMembership.update({ where: { id: memberA.id }, data: { role: "BARBER" } });
      await assert.rejects(schedules.addClosure(principal, shopA, "2026-07-03"), /Forbidden/);
    });
  } finally {
    try {
      await database.barberScheduleOverride.deleteMany({ where });
      await database.shopClosure.deleteMany({ where });
      await database.appointment.deleteMany({ where });
      await database.barberSchedulePeriod.deleteMany({ where });
      await database.barberTimeOff.deleteMany({ where });
      await database.auditEvent.deleteMany({ where });
      await database.barber.deleteMany({ where });
      await database.shopMembership.deleteMany({ where });
      await database.user.deleteMany({ where: { id: userId } });
      await database.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } });
    } finally { await database.$disconnect(); }
  }
});
