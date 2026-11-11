import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createOwnerBookings, SlotUnavailableError } from "../packages/database/src/bookings";
import { ReschedulingDeadlineError } from "../packages/database/src/booking-reschedule";

test("rescheduling keeps saved values, respects occupancy and deadlines, and is audited", async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const shopId = randomUUID(), userId = randomUUID(), targetUserId = randomUUID();
  const where = { barbershopId: shopId };
  const minutes = (row: { startsAt: Date; serviceEndsAt: Date; occupiedUntil: Date }) => [(row.serviceEndsAt.getTime() - row.startsAt.getTime()) / 60_000, (row.occupiedUntil.getTime() - row.serviceEndsAt.getTime()) / 60_000];
  try {
    await db.barbershop.create({ data: { id: shopId, name: "Reschedule", slug: `move-${shopId}`, currency: "USD" } });
    await db.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const member = await db.shopMembership.create({ data: { ...where, userId, role: "OWNER" } });
    const barber = await db.barber.create({ data: { ...where, membershipId: member.id, displayName: "Barber" } });
    const service = await db.service.create({ data: { ...where, name: "Hair", priceMinor: 1500, durationMinutes: 30, currency: "USD" } });
    await db.barberService.create({ data: { ...where, barberId: barber.id, serviceId: service.id } });
    // Wednesday 09:00–18:00 Beirut (UTC+3 in July): 06:00–15:00Z.
    await db.barberSchedulePeriod.create({ data: { ...where, barberId: barber.id, dayOfWeek: 3, kind: "WORK", startMinute: 540, endMinute: 1080 } });
    await db.shopBookingPolicy.create({ data: { ...where, slotIntervalMinutes: 15, minimumNoticeMinutes: 0, bufferAfterMinutes: 15, cancellationNoticeMinutes: 0, reschedulingNoticeMinutes: 0, approvalMode: "AUTOMATIC" } });
    const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopId, role: "OWNER" }] };
    const bookings = createOwnerBookings(db, () => new Date("2026-07-01T05:00Z"));
    const base = { barberId: barber.id, serviceIds: [service.id], date: "2026-07-01" };
    const first = await bookings.create(principal, shopId, { ...base, startsAt: Date.parse("2026-07-01T06:00Z"), guest: { name: "First", phone: "" } });
    await bookings.create(principal, shopId, { ...base, startsAt: Date.parse("2026-07-01T08:00Z"), guest: { name: "Second", phone: "" } });
    const id = first.appointment.id;

    // Later catalog and policy changes must not alter the saved appointment.
    await db.service.update({ where: { id: service.id }, data: { durationMinutes: 90, priceMinor: 9900 } });
    await db.shopBookingPolicy.update({ where: { barbershopId: shopId }, data: { bufferAfterMinutes: 0 } });

    const options = await bookings.rescheduleOptions(principal, shopId, id, base.date);
    assert(!options.starts.includes(Date.parse("2026-07-01T06:00Z")), "the current start is not offered");
    assert(options.starts.includes(Date.parse("2026-07-01T07:00Z")));
    assert(!options.starts.includes(Date.parse("2026-07-01T07:30Z")), "saved 30+15 minutes would overlap the 08:00 booking");
    assert(!options.starts.includes(Date.parse("2026-07-01T14:30Z")), "saved occupancy must end within working hours");

    const expectedStartsAt = first.appointment.startsAt.toISOString();
    await assert.rejects(bookings.reschedule(null, shopId, id, { expectedStartsAt, date: base.date, startsAt: Date.parse("2026-07-01T07:00Z"), overrideDeadline: false }), /Forbidden/);
    await assert.rejects(bookings.reschedule(principal, shopId, id, { expectedStartsAt, date: base.date, startsAt: Date.parse("2026-07-01T07:30Z"), overrideDeadline: false }), SlotUnavailableError);
    await assert.rejects(bookings.reschedule(principal, shopId, id, { expectedStartsAt: "2026-07-01T05:00:00.000Z", date: base.date, startsAt: Date.parse("2026-07-01T07:00Z"), overrideDeadline: false }), /Appointment changed/);

    const moved = await bookings.reschedule(principal, shopId, id, { expectedStartsAt, date: base.date, startsAt: Date.parse("2026-07-01T07:00Z"), overrideDeadline: false });
    assert.deepEqual(moved.after, { barberId: barber.id, startsAt: "2026-07-01T07:00:00.000Z", status: "CONFIRMED" });
    const saved = await db.appointment.findUniqueOrThrow({ where: { id }, include: { services: true } });
    assert.deepEqual(minutes(saved), [30, 15]);
    assert.deepEqual(saved.services.map(row => [row.durationMinutes, row.priceMinor]), [[30, 1500]]);
    await assert.rejects(bookings.reschedule(principal, shopId, id, { expectedStartsAt, date: base.date, startsAt: Date.parse("2026-07-01T09:00Z"), overrideDeadline: false }), /Appointment changed/, "stale forms cannot move it again");

    await db.shopBookingPolicy.update({ where: { barbershopId: shopId }, data: { reschedulingNoticeMinutes: 600 } });
    const late = { expectedStartsAt: saved.startsAt.toISOString(), date: base.date, startsAt: Date.parse("2026-07-01T10:00Z") };
    assert.equal((await bookings.rescheduleOptions(principal, shopId, id, base.date)).deadlinePassed, true);
    await assert.rejects(bookings.reschedule(principal, shopId, id, { ...late, overrideDeadline: false }), ReschedulingDeadlineError);
    await bookings.reschedule(principal, shopId, id, { ...late, overrideDeadline: true });
    const events = await db.auditEvent.findMany({ where: { ...where, event: "booking.rescheduled" }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(events.map(event => (event.details as { deadlineOverridden: boolean }).deadlineOverridden), [false, true]);
    await db.user.create({ data: { id: targetUserId, email: `${targetUserId}@example.invalid` } });
    const targetMember = await db.shopMembership.create({ data: { ...where, userId: targetUserId, role: "BARBER", manageAppointments: true } });
    const target = await db.barber.create({ data: { ...where, membershipId: targetMember.id, displayName: "Target" } });
    await db.barberSchedulePeriod.create({ data: { ...where, barberId: target.id, dayOfWeek: 3, kind: "WORK", startMinute: 540, endMinute: 1080 } });
    const input = { expectedStartsAt: "2026-07-01T10:00:00.000Z", expectedBarberId: barber.id, barberId: target.id, date: base.date, startsAt: Date.parse("2026-07-01T10:00Z"), overrideDeadline: true };
    assert(!(await bookings.rescheduleOptions(principal, shopId, id, base.date)).barbers.some(row => row.id === target.id));
    await assert.rejects(bookings.reschedule(principal, shopId, id, input), SlotUnavailableError, "target must support saved services");
    await db.barberService.create({ data: { ...where, barberId: target.id, serviceId: service.id, priceMinor: 20000, durationMinutes: 120 } });
    assert((await bookings.rescheduleOptions(principal, shopId, id, base.date, target.id)).starts.includes(input.startsAt), "another barber may keep the same start");
    await db.shopMembership.update({ where: { id: targetMember.id }, data: { accessDisabledAt: new Date(), manageAppointments: false } });
    await assert.rejects(bookings.reschedule(principal, shopId, id, input), SlotUnavailableError);
    await db.shopMembership.update({ where: { id: targetMember.id }, data: { accessDisabledAt: null, manageAppointments: true } });
    await assert.rejects(bookings.reschedule(principal, shopId, id, { ...input, barberId: randomUUID() }), SlotUnavailableError);
    const changed = await bookings.reschedule(principal, shopId, id, input);
    assert.equal(changed.before.barberId, barber.id);
    assert.equal(changed.after.barberId, target.id);
    await assert.rejects(bookings.reschedule(principal, shopId, id, input), /Appointment changed/, "same-time barber changes invalidate stale forms");
    const retained = await db.appointment.findUniqueOrThrow({ where: { id }, include: { services: true } });
    assert.equal(retained.barberId, target.id);
    assert.deepEqual(minutes(retained), [30, 15]);
    assert.deepEqual(retained.services.map(row => [row.durationMinutes, row.priceMinor]), [[30, 1500]]);
    const barberPrincipal: StaffPrincipal = { userId: targetUserId, memberships: [{ barbershopId: shopId, role: "BARBER" }] };
    assert.deepEqual((await bookings.rescheduleOptions(barberPrincipal, shopId, id, base.date)).barbers.map(row => row.id), [target.id]);
    await assert.rejects(bookings.rescheduleOptions(barberPrincipal, shopId, id, base.date, barber.id), /Forbidden/);
    await assert.rejects(bookings.reschedule(barberPrincipal, shopId, id, { ...input, expectedBarberId: target.id, barberId: barber.id, overrideDeadline: false }), /Forbidden/);
    await assert.rejects(bookings.reschedule(principal, shopId, id, { ...input, expectedBarberId: target.id, barberId: barber.id, startsAt: Date.parse("2026-07-01T08:00Z") }), SlotUnavailableError, "target occupancy is enforced");
    const second = await db.appointment.findFirstOrThrow({ where: { ...where, guestName: "Second" } });
    const race = await Promise.allSettled([
      bookings.reschedule(principal, shopId, id, { ...input, expectedBarberId: target.id, barberId: barber.id, startsAt: Date.parse("2026-07-01T11:00Z") }),
      bookings.reschedule(principal, shopId, second.id, { ...input, expectedStartsAt: second.startsAt.toISOString(), barberId: barber.id, startsAt: Date.parse("2026-07-01T11:00Z") }),
    ]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1, "concurrent moves cannot claim the same target slot");
    assert(race.some(result => result.status === "rejected" && result.reason instanceof SlotUnavailableError));
    const audit = await db.auditEvent.findFirstOrThrow({ where: { ...where, event: "booking.rescheduled", details: { path: ["after", "barberId"], equals: target.id } } });
    assert.equal((audit.details as { before: { barberId: string } }).before.barberId, barber.id);

  } finally {
    try {
      await db.appointmentService.deleteMany({ where }); await db.appointment.deleteMany({ where });
      await db.auditEvent.deleteMany({ where });
      await db.barberSchedulePeriod.deleteMany({ where }); await db.shopBookingPolicy.deleteMany({ where });
      await db.barberService.deleteMany({ where }); await db.service.deleteMany({ where });
      await db.barber.deleteMany({ where }); await db.shopMembership.deleteMany({ where });
      await db.user.deleteMany({ where: { id: { in: [userId, targetUserId] } } }); await db.barbershop.deleteMany({ where: { id: shopId } });
    } finally { await db.$disconnect(); }
  }
});
