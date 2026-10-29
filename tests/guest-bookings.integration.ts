import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createOwnerBookings, ClientPhoneExistsError, SlotUnavailableError } from "../packages/database/src/bookings";

test("guest and quick bookings retain tenant and transactional booking guarantees", async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const shopId = randomUUID(), userId = randomUUID();
  const where = { barbershopId: shopId };
  try {
    await db.barbershop.create({ data: { id: shopId, name: "Guest smoke", slug: `guest-${shopId}`, currency: "USD" } });
    await db.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const member = await db.shopMembership.create({ data: { ...where, userId, role: "OWNER" } });
    const barber = await db.barber.create({ data: { ...where, membershipId: member.id, displayName: "Barber" } });
    const service = await db.service.create({ data: { ...where, name: "Hair", priceMinor: 1500, durationMinutes: 30, currency: "USD" } });
    await db.barberService.create({ data: { ...where, barberId: barber.id, serviceId: service.id } });
    await db.barberSchedulePeriod.create({ data: { ...where, barberId: barber.id, dayOfWeek: 3, kind: "WORK", startMinute: 540, endMinute: 1080 } });
    await db.shopBookingPolicy.create({ data: { ...where, slotIntervalMinutes: 15, minimumNoticeMinutes: 0, bufferAfterMinutes: 15, cancellationNoticeMinutes: 0, reschedulingNoticeMinutes: 0, approvalMode: "MANUAL" } });
    const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopId, role: "OWNER" }] };
    const bookings = createOwnerBookings(db, () => new Date("2026-07-01T05:00Z"));
    const base = { barberId: barber.id, serviceIds: [service.id], date: "2026-07-01", startsAt: Date.parse("2026-07-01T06:00Z") };
    const guest = await bookings.create(principal, shopId, { ...base, guest: { name: " Guest ", phone: "" } });
    assert.equal(guest.appointment.guestName, "Guest");
    assert.equal(guest.appointment.clientId, null);
    assert.equal(guest.appointment.guestPhone, null);
    assert.equal(await db.client.count({ where }), 0);
    await assert.rejects(bookings.create(principal, shopId, { ...base, newClient: { name: "Rollback", phone: "+96170000111" } }), SlotUnavailableError);
    assert.equal(await db.client.count({ where }), 0);
    assert.equal(await db.auditEvent.count({ where: { ...where, event: "client.registered" } }), 0);
    const quick = await bookings.create(principal, shopId, { ...base, startsAt: base.startsAt + 3_600_000, newClient: { name: "New", phone: "+96170000111" } });
    assert(quick.appointment.clientId);
    assert.equal(await db.client.count({ where }), 1);
    assert.equal(await db.clientAccount.count({ where }), 0);
    await assert.rejects(bookings.create(principal, shopId, { ...base, startsAt: base.startsAt + 7_200_000, newClient: { name: "Duplicate", phone: "+96170000111" } }), ClientPhoneExistsError);
    await assert.rejects(bookings.create(null, shopId, { ...base, guest: { name: "Denied", phone: "" } }), /Forbidden/);
    assert.equal(await db.appointment.count({ where }), 2);
    assert.equal(await db.appointmentService.count({ where }), 2);
    assert((await bookings.day(principal, shopId, base.date)).appointments.some(row => row.guestName === "Guest"));
  } finally {
    try {
      await db.appointmentService.deleteMany({ where }); await db.appointment.deleteMany({ where });
      await db.auditEvent.deleteMany({ where }); await db.client.deleteMany({ where });
      await db.barberSchedulePeriod.deleteMany({ where }); await db.shopBookingPolicy.deleteMany({ where });
      await db.barberService.deleteMany({ where }); await db.service.deleteMany({ where });
      await db.barber.deleteMany({ where }); await db.shopMembership.deleteMany({ where });
      await db.user.deleteMany({ where: { id: userId } }); await db.barbershop.deleteMany({ where: { id: shopId } });
    } finally { await db.$disconnect(); }
  }
});
