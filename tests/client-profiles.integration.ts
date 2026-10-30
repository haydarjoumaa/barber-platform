import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createClientProfiles } from "../packages/database/src/client-profiles";

test("owner client profiles isolate history and paginate saved snapshots", async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const shopId = randomUUID(), otherShopId = randomUUID(), userId = randomUUID();
  const where = { barbershopId: { in: [shopId, otherShopId] } };
  try {
    for (const id of [shopId, otherShopId]) await db.barbershop.create({ data: { id, name: "Profile test", slug: `profile-${id}`, currency: "USD" } });
    await db.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const member = await db.shopMembership.create({ data: { barbershopId: shopId, userId, role: "OWNER" } });
    const barber = await db.barber.create({ data: { barbershopId: shopId, membershipId: member.id, displayName: "Barber" } });
    const client = await db.client.create({ data: { barbershopId: shopId, name: "Client A", phone: "+96171123456" } });
    const other = await db.client.create({ data: { barbershopId: otherShopId, name: "Private client", phone: client.phone } });
    const empty = await db.client.create({ data: { barbershopId: shopId, name: "No appointments", phone: "+96171123457" } });
    const service = await db.service.create({ data: { barbershopId: shopId, name: "Current name", durationMinutes: 30, priceMinor: 9000, currency: "USD" } });
    const startsAt = new Date("2026-10-24T09:00:00Z");
    const serviceEndsAt = new Date("2026-10-24T09:30:00Z");
    const ids = Array.from({ length: 21 }, () => randomUUID()).sort().reverse();
    for (const id of ids) {
      await db.appointment.create({ data: { id, barbershopId: shopId, barberId: barber.id, clientId: client.id,
        status: "CANCELLED", startsAt, serviceEndsAt, occupiedUntil: serviceEndsAt } });
      await db.appointmentService.create({ data: { barbershopId: shopId, appointmentId: id, serviceId: service.id,
        position: 0, name: "Original name", durationMinutes: 30, priceMinor: 1500, currency: "USD" } });
    }
    // Neither a guest with the same phone nor another client is part of this history.
    await db.appointment.create({ data: { barbershopId: shopId, barberId: barber.id, guestName: "Guest", guestPhone: client.phone,
      status: "CANCELLED", startsAt, serviceEndsAt, occupiedUntil: serviceEndsAt } });
    const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopId, role: "OWNER" }] };
    const profiles = createClientProfiles(db);
    const first = await profiles.get(principal, shopId, client.id);
    assert(first);
    assert.equal(first.total, 21);
    assert.equal(first.pages, 2);
    assert.equal(first.timeZone, "Asia/Beirut");
    assert.deepEqual(first.appointments.map(row => row.id), ids.slice(0, 20));
    assert.deepEqual(first.appointments[0]!.services, [{ name: "Original name", priceMinor: 1500, currency: "USD" }]);
    assert.equal(first.appointments[0]!.status, "CANCELLED");
    const last = await profiles.get(principal, shopId, client.id, 999999);
    assert.equal(last!.page, 2);
    assert.deepEqual(last!.appointments.map(row => row.id), ids.slice(20));
    assert.equal((await profiles.get(principal, shopId, empty.id))!.total, 0);
    assert.equal(await profiles.get(principal, shopId, other.id), null);
    assert.equal(await profiles.get(principal, shopId, randomUUID()), null);
    await assert.rejects(profiles.get(null, shopId, client.id), /Forbidden/);
    await assert.rejects(profiles.get(principal, otherShopId, other.id), /Forbidden/);
    for (const role of ["BARBER", "RECEPTIONIST"] as const) {
      await assert.rejects(profiles.get({ userId, memberships: [{ barbershopId: shopId, role }] }, shopId, client.id), /Forbidden/);
    }
    for (const page of [0, -1, 1.2, Infinity]) assert.throws(() => profiles.get(principal, shopId, client.id, page), /Invalid/);
    await db.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
    await assert.rejects(profiles.get(principal, shopId, client.id), /Forbidden/);
    await db.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
    await db.barbershop.update({ where: { id: shopId }, data: { deletedAt: new Date() } });
    await assert.rejects(profiles.get(principal, shopId, client.id), /Forbidden/);
  } finally {
    try {
      await db.appointmentService.deleteMany({ where }); await db.appointment.deleteMany({ where });
      await db.service.deleteMany({ where }); await db.client.deleteMany({ where });
      await db.barber.deleteMany({ where }); await db.shopMembership.deleteMany({ where });
      await db.user.deleteMany({ where: { id: userId } });
      await db.barbershop.deleteMany({ where: { id: { in: [shopId, otherShopId] } } });
    } finally { await db.$disconnect(); }
  }
});
