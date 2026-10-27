import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL to a migrated local development database");
const database = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

test("tenant relationships and shop-specific phone uniqueness are enforced in PostgreSQL", async () => {
  const suffix = randomUUID();
  const shopA = randomUUID();
  const shopB = randomUUID();
  const userId = randomUUID();
  try {
    await database.barbershop.createMany({ data: [
      { id: shopA, name: "Test A", slug: `test-a-${suffix}` },
      { id: shopB, name: "Test B", slug: `test-b-${suffix}` },
    ] });
    await database.user.create({ data: { id: userId, email: `${suffix}@example.invalid` } });
    const membership = await database.shopMembership.create({ data: { barbershopId: shopA, userId, role: "OWNER" } });
    await database.barber.create({ data: { barbershopId: shopA, membershipId: membership.id, displayName: "Test" } });
    await assert.rejects(database.barber.create({ data: { barbershopId: shopB, membershipId: membership.id, displayName: "Invalid" } }), { code: "P2003" });
    const client = await database.client.create({ data: { barbershopId: shopA, name: "Test", phone: "+96170000000" } });
    await database.client.create({ data: { barbershopId: shopB, name: "Test", phone: client.phone } });
    await assert.rejects(database.client.create({ data: { barbershopId: shopA, name: "Duplicate", phone: client.phone } }), { code: "P2002" });
    await database.clientAccount.create({ data: { barbershopId: shopA, clientId: client.id, passwordHash: "test-placeholder-not-a-login" } });
    await assert.rejects(database.clientAccount.create({ data: { barbershopId: shopB, clientId: client.id, passwordHash: "test-placeholder-not-a-login" } }), { code: "P2003" });
  } finally {
    const where = { barbershopId: { in: [shopA, shopB] } };
    try {
      await database.clientAccount.deleteMany({ where });
      await database.client.deleteMany({ where });
      await database.barber.deleteMany({ where });
      await database.shopMembership.deleteMany({ where });
      await database.user.deleteMany({ where: { id: userId } });
      await database.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } });
    } finally { await database.$disconnect(); }
  }
});
