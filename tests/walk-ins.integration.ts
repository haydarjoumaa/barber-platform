import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createOwnerBookings, SlotUnavailableError } from "../packages/database/src/bookings";
import { createWalkIns, WalkInQueueDisabledError } from "../packages/database/src/walk-ins";

test("walk-ins skip notice and grid but not occupancy; the queue is gated, ordered and audited", async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const shopId = randomUUID(), userId = randomUUID(), otherUserId = randomUUID();
  const where = { barbershopId: shopId };
  try {
    await db.barbershop.create({ data: { id: shopId, name: "Walk-ins", slug: `walk-${shopId}`, currency: "USD" } });
    await db.user.createMany({ data: [{ id: userId, email: `${userId}@example.invalid` }, { id: otherUserId, email: `${otherUserId}@example.invalid` }] });
    const member = await db.shopMembership.create({ data: { ...where, userId, role: "OWNER" } });
    const disabledMember = await db.shopMembership.create({ data: { ...where, userId: otherUserId, role: "BARBER", accessDisabledAt: new Date() } });
    const barber = await db.barber.create({ data: { ...where, membershipId: member.id, displayName: "Owner" } });
    const disabledBarber = await db.barber.create({ data: { ...where, membershipId: disabledMember.id, displayName: "Disabled" } });
    const service = await db.service.create({ data: { ...where, name: "Hair", priceMinor: 1500, durationMinutes: 30, currency: "USD" } });
    for (const id of [barber.id, disabledBarber.id]) {
      await db.barberService.create({ data: { ...where, barberId: id, serviceId: service.id } });
      await db.barberSchedulePeriod.create({ data: { ...where, barberId: id, dayOfWeek: 3, kind: "WORK", startMinute: 540, endMinute: 1080 } });
    }
    // A 2-hour minimum notice and 15-minute grid would forbid 07:11Z; walk-ins ignore both.
    await db.shopBookingPolicy.create({ data: { ...where, slotIntervalMinutes: 15, minimumNoticeMinutes: 120, bufferAfterMinutes: 15, cancellationNoticeMinutes: 0, reschedulingNoticeMinutes: 0, approvalMode: "MANUAL" } });
    const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopId, role: "OWNER" }] };
    await createOwnerBookings(db, () => new Date("2026-07-01T03:00Z")).create(principal, shopId, { barberId: barber.id, serviceIds: [service.id], date: "2026-07-01", startsAt: Date.parse("2026-07-01T06:00Z"), guest: { name: "Booked", phone: "" } });

    const walkIns = createWalkIns(db, () => new Date("2026-07-01T07:10:20Z"));
    await assert.rejects(walkIns.create(null, shopId, { serviceIds: [service.id], guest: { name: "Denied", phone: "" } }), /Forbidden/);
    await assert.rejects(walkIns.create(principal, shopId, { serviceIds: [service.id], barberId: disabledBarber.id, guest: { name: "Nope", phone: "" } }), /Barber not found/);
    const first = await walkIns.create(principal, shopId, { serviceIds: [service.id], guest: { name: "First", phone: "" } });
    assert.equal(first.appointment.startsAt.toISOString(), "2026-07-01T07:11:00.000Z");
    assert.equal(first.appointment.barberId, barber.id, "disabled barbers are not offered to 'any barber'");
    assert.equal(first.appointment.status, "CONFIRMED", "walk-ins skip manual approval");
    assert.equal(first.appointment.walkIn, true);
    const second = await walkIns.create(principal, shopId, { serviceIds: [service.id], newClient: { name: "Second", phone: "+96170000222" } });
    assert.equal(second.appointment.startsAt.toISOString(), "2026-07-01T07:56:00.000Z", "starts after the first walk-in plus buffer");
    assert.equal(await db.client.count({ where }), 1);

    await assert.rejects(walkIns.enqueue(principal, shopId, { serviceIds: [service.id], guest: { name: "Early", phone: "" } }), WalkInQueueDisabledError);
    await walkIns.setQueueEnabled(principal, shopId, true);
    const a = await walkIns.enqueue(principal, shopId, { serviceIds: [service.id], guest: { name: "Queue A", phone: "+96170000333" } });
    const b = await walkIns.enqueue(principal, shopId, { serviceIds: [service.id], preferredBarberId: barber.id, guest: { name: "Queue B", phone: "" } });
    await assert.rejects(walkIns.enqueue(principal, shopId, { serviceIds: [service.id], preferredBarberId: disabledBarber.id, guest: { name: "Bad", phone: "" } }), /Barber not found/);
    assert.deepEqual((await walkIns.queue(principal, shopId)).entries.map(entry => entry.guestName), ["Queue A", "Queue B"]);

    const served = await walkIns.serve(principal, shopId, a.id);
    assert.equal(served.appointment.startsAt.toISOString(), "2026-07-01T08:41:00.000Z");
    assert.equal(served.appointment.guestPhone, "+96170000333");
    const entry = await db.walkInQueueEntry.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(entry.status, "SERVED");
    assert.equal(entry.appointmentId, served.appointment.id);
    await assert.rejects(walkIns.serve(principal, shopId, a.id), /Queue entry changed/);
    await walkIns.remove(principal, shopId, b.id);
    await assert.rejects(walkIns.remove(principal, shopId, b.id), /Queue entry changed/);
    assert.equal((await walkIns.queue(principal, shopId)).entries.length, 0);

    // A preference can become unavailable while a client waits. Staff may explicitly
    // choose the sole remaining active barber without silently changing that preference.
    await db.shopMembership.update({ where: { id: disabledMember.id }, data: { accessDisabledAt: null } });
    const waiting = await walkIns.enqueue(principal, shopId, { serviceIds: [service.id], preferredBarberId: disabledBarber.id, guest: { name: "Waiting for preference", phone: "" } });
    await db.shopMembership.update({ where: { id: disabledMember.id }, data: { accessDisabledAt: new Date() } });
    await assert.rejects(walkIns.serve(principal, shopId, waiting.id), /Barber not found/);
    assert.equal((await db.walkInQueueEntry.findUniqueOrThrow({ where: { id: waiting.id } })).status, "WAITING");
    const reassigned = await walkIns.serve(principal, shopId, waiting.id, barber.id);
    assert.equal(reassigned.appointment.barberId, barber.id);
    assert.equal((await db.walkInQueueEntry.findUniqueOrThrow({ where: { id: waiting.id } })).appointmentId, reassigned.appointment.id);

    // Late in the day nothing fits before midnight: 17:40 Beirut leaves 20 minutes of working time.
    await assert.rejects(createWalkIns(db, () => new Date("2026-07-01T14:40Z")).create(principal, shopId, { serviceIds: [service.id], guest: { name: "Late", phone: "" } }), SlotUnavailableError);
    const events = (await db.auditEvent.findMany({ where, select: { event: true } })).map(row => row.event);
    for (const event of ["booking.walk_in_created", "shop.walk_in_queue_toggled", "queue.joined", "queue.removed"]) assert(events.includes(event), event);
  } finally {
    try {
      await db.walkInQueueEntry.deleteMany({ where });
      await db.appointmentService.deleteMany({ where }); await db.appointment.deleteMany({ where });
      await db.auditEvent.deleteMany({ where }); await db.client.deleteMany({ where });
      await db.barberSchedulePeriod.deleteMany({ where }); await db.shopBookingPolicy.deleteMany({ where });
      await db.barberService.deleteMany({ where }); await db.service.deleteMany({ where });
      await db.barber.deleteMany({ where }); await db.shopMembership.deleteMany({ where });
      await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } }); await db.barbershop.deleteMany({ where: { id: shopId } });
    } finally { await db.$disconnect(); }
  }
});
