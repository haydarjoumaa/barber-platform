import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createShopPublication, PublicationIncompleteError } from "../packages/database/src/shop-publication";

test("shop publication is owner-only, gated by readiness and audited", async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const shopId = randomUUID(), otherShopId = randomUUID(), userId = randomUUID();
  const where = { barbershopId: { in: [shopId, otherShopId] } };
  const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopId, role: "OWNER" }] };
  const publication = createShopPublication(db);
  const gaps = (expected: string[]) => (error: unknown) => error instanceof PublicationIncompleteError && JSON.stringify(error.gaps) === JSON.stringify(expected);
  try {
    await db.barbershop.createMany({ data: [{ id: shopId, name: "Ready", slug: `shop-${shopId}` }, { id: otherShopId, name: "Other", slug: `shop-${otherShopId}` }] });
    await db.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const member = await db.shopMembership.create({ data: { barbershopId: shopId, userId, role: "OWNER" } });
    await assert.rejects(publication.publish(null, shopId), /Forbidden/);
    await assert.rejects(publication.publish(principal, otherShopId), /Forbidden/);
    await assert.rejects(publication.publish({ userId, memberships: [{ barbershopId: shopId, role: "BARBER" }] }, shopId), /Forbidden/);
    await assert.rejects(publication.publish(principal, shopId), gaps(["phone", "address", "currency", "services", "barbers", "policy"]));

    await db.barbershop.update({ where: { id: shopId }, data: { phone: "+96170123456", address: "Hamra, Beirut", currency: "USD" } });
    const service = await db.service.create({ data: { barbershopId: shopId, name: "Cut", durationMinutes: 30, priceMinor: 1000, currency: "USD" } });
    const barber = await db.barber.create({ data: { barbershopId: shopId, membershipId: member.id, displayName: "Owner" } });
    await assert.rejects(publication.publish(principal, shopId), gaps(["barbers", "policy"]));
    await db.barberService.create({ data: { barbershopId: shopId, barberId: barber.id, serviceId: service.id } });
    await db.barberSchedulePeriod.create({ data: { barbershopId: shopId, barberId: barber.id, dayOfWeek: 1, kind: "BREAK", startMinute: 720, endMinute: 780 } });
    await assert.rejects(publication.publish(principal, shopId), gaps(["barbers", "policy"]), "breaks alone are not working hours");
    await db.barberSchedulePeriod.create({ data: { barbershopId: shopId, barberId: barber.id, dayOfWeek: 1, kind: "WORK", startMinute: 540, endMinute: 1020 } });
    await db.shopBookingPolicy.create({ data: { barbershopId: shopId, slotIntervalMinutes: 15, minimumNoticeMinutes: 60, bufferAfterMinutes: 0, cancellationNoticeMinutes: 120, reschedulingNoticeMinutes: 120, approvalMode: "AUTOMATIC" } });
    assert.equal(await db.auditEvent.count({ where }), 0);

    const published = await publication.publish(principal, shopId);
    assert(published.publishedAt instanceof Date);
    assert.deepEqual((await publication.publish(principal, shopId)).publishedAt, published.publishedAt, "publishing twice keeps the original time");
    assert.deepEqual((await db.auditEvent.findMany({ where, select: { event: true, actorUserId: true } })), [{ event: "shop.published", actorUserId: userId }]);

    await db.service.update({ where: { id: service.id }, data: { archivedAt: new Date() } });
    const status = await publication.status(principal, shopId);
    assert.deepEqual(status.gaps, ["services", "barbers"]);
    assert(status.publishedAt, "incomplete live shops stay published until the owner acts");

    assert.deepEqual(await publication.unpublish(principal, shopId), { publishedAt: null });
    assert.deepEqual(await publication.unpublish(principal, shopId), { publishedAt: null });
    assert.equal(await db.auditEvent.count({ where: { barbershopId: shopId, event: "shop.unpublished" } }), 1);
    assert.equal((await db.barbershop.findUniqueOrThrow({ where: { id: otherShopId } })).publishedAt, null);

    await db.barbershop.update({ where: { id: shopId }, data: { suspendedAt: new Date() } });
    await assert.rejects(publication.unpublish(principal, shopId), /Forbidden/);
  } finally {
    try {
      await db.auditEvent.deleteMany({ where }); await db.shopBookingPolicy.deleteMany({ where });
      await db.barberSchedulePeriod.deleteMany({ where }); await db.barberService.deleteMany({ where });
      await db.barber.deleteMany({ where }); await db.service.deleteMany({ where }); await db.shopMembership.deleteMany({ where });
      await db.user.deleteMany({ where: { id: userId } });
      await db.barbershop.deleteMany({ where: { id: { in: [shopId, otherShopId] } } });
    } finally { await db.$disconnect(); }
  }
});
