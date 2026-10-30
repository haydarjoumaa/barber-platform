import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createShopProfiles, ShopProfileError } from "../packages/database/src/shop-profile";

test("shop profile edits are tenant-safe, audited and race-safe", async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const shopId = randomUUID(), otherShopId = randomUUID(), userId = randomUUID();
  const before = { name: "Original", slug: `shop-${shopId}` };
  const other = { name: "Other", slug: `shop-${otherShopId}` };
  const changed = { name: "Updated", slug: `new-${shopId}` };
  const where = { barbershopId: { in: [shopId, otherShopId] } };
  const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopId, role: "OWNER" }] };
  const profiles = createShopProfiles(db);
  const code = (code: string) => (error: unknown) => error instanceof ShopProfileError && error.code === code;
  try {
    await db.barbershop.createMany({ data: [{ id: shopId, ...before }, { id: otherShopId, ...other }] });
    await db.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const member = await db.shopMembership.create({ data: { barbershopId: shopId, userId, role: "OWNER" } });
    await assert.rejects(profiles.update(null, shopId, changed, before), /Forbidden/);
    await assert.rejects(profiles.update(principal, otherShopId, changed, other), /Forbidden/);
    for (const role of ["BARBER", "RECEPTIONIST"] as const) {
      await assert.rejects(profiles.update({ userId, memberships: [{ barbershopId: shopId, role }] }, shopId, changed, before), /Forbidden/);
    }
    await assert.rejects(profiles.update(principal, shopId, { ...changed, slug: "business" }, before), code("INVALID"));
    await assert.rejects(profiles.update(principal, shopId, { ...changed, slug: other.slug }, before), code("SLUG_TAKEN"));
    assert.equal(await db.auditEvent.count({ where }), 0);
    assert.deepEqual(await profiles.update(principal, shopId, before, before), before);
    assert.equal(await db.auditEvent.count({ where }), 0);

    const race = await Promise.allSettled([profiles.update(principal, shopId, changed, before), profiles.update(principal, shopId, changed, before)]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    const rejected = race.find(result => result.status === "rejected");
    assert(rejected?.status === "rejected" && code("STALE")(rejected.reason));
    const event = await db.auditEvent.findFirstOrThrow({ where: { barbershopId: shopId } });
    assert.equal(event.actorUserId, userId);
    assert.equal(event.event, "shop.profile_updated");
    assert.deepEqual(event.details, { before, after: changed });
    assert.equal(await db.auditEvent.count({ where }), 1);
    assert.equal((await db.barbershop.findUniqueOrThrow({ where: { id: shopId } })).publishedAt, null);
    assert.equal((await db.barbershop.findUniqueOrThrow({ where: { id: otherShopId } })).name, other.name);

    const failing = db.$extends({ query: { auditEvent: { async create() { throw new Error("Injected audit failure"); } } } });
    await assert.rejects(createShopProfiles(failing as unknown as PrismaClient).update(principal, shopId, before, changed), /Injected audit failure/);
    assert.equal((await db.barbershop.findUniqueOrThrow({ where: { id: shopId } })).slug, changed.slug);
    await db.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
    await assert.rejects(profiles.update(principal, shopId, before, changed), /Forbidden/);
    await db.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
    await db.barbershop.update({ where: { id: shopId }, data: { deletedAt: new Date() } });
    await assert.rejects(profiles.update(principal, shopId, before, changed), /Forbidden/);
  } finally {
    try {
      await db.auditEvent.deleteMany({ where }); await db.shopMembership.deleteMany({ where });
      await db.user.deleteMany({ where: { id: userId } });
      await db.barbershop.deleteMany({ where: { id: { in: [shopId, otherShopId] } } });
    } finally { await db.$disconnect(); }
  }
});
