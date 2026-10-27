import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { findAvailableSlots } from "@barber/shared";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createServiceCatalog } from "../packages/database/src/catalog";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL to a migrated local development database");
const database = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const catalog = createServiceCatalog(database);
const shopA = randomUUID();
const shopB = randomUUID();
const ownerId = randomUUID();
const staffId = randomUUID();
const principal: StaffPrincipal = { userId: ownerId, memberships: [{ barbershopId: shopA, role: "OWNER" }] };
const otherPrincipal: StaffPrincipal = { userId: staffId, memberships: [{ barbershopId: shopB, role: "OWNER" }] };
const haircut = { name: "Haircut", durationMinutes: 30, priceMinor: 1500 };

test("persistent service catalog authorization, overrides and audit records", { timeout: 30_000 }, async t => {
  try {
    await database.barbershop.createMany({ data: [
      { id: shopA, name: "Catalog A", slug: `catalog-a-${shopA}` },
      { id: shopB, name: "Catalog B", slug: `catalog-b-${shopB}` },
    ] });
    await database.user.createMany({ data: [
      { id: ownerId, email: `${ownerId}@example.invalid` },
      { id: staffId, email: `${staffId}@example.invalid` },
    ] });
    const ownerMembership = await database.shopMembership.create({ data: { barbershopId: shopA, userId: ownerId, role: "OWNER" } });
    const staffMembership = await database.shopMembership.create({ data: { barbershopId: shopA, userId: staffId, role: "BARBER" } });
    const otherMembership = await database.shopMembership.create({ data: { barbershopId: shopB, userId: staffId, role: "OWNER" } });
    const barberA = await database.barber.create({ data: { barbershopId: shopA, membershipId: staffMembership.id, displayName: "Barber A" } });
    const barberB = await database.barber.create({ data: { barbershopId: shopB, membershipId: otherMembership.id, displayName: "Barber B" } });

    t.beforeEach(async () => {
      const where = { barbershopId: { in: [shopA, shopB] } };
      await database.barberService.deleteMany({ where });
      await database.service.deleteMany({ where });
      await database.auditEvent.deleteMany({ where });
      await database.barbershop.updateMany({ where: { id: { in: [shopA, shopB] } }, data: { currency: null, deletedAt: null } });
      await database.shopMembership.update({ where: { id: ownerMembership.id }, data: { role: "OWNER" } });
    });

    await t.test("requires explicit currency and ignores supplied tenant/currency fields", async () => {
      await assert.rejects(catalog.createService(principal, shopA, haircut), /Configure shop currency first/);
      await assert.rejects(catalog.setCurrency(principal, shopA, "usd"), /Unsupported currency/);
      await catalog.setCurrency(principal, shopA, "USD");
      const injected = { ...haircut, barbershopId: shopB, currency: "LBP" };
      const service = await catalog.createService(principal, shopA, injected);
      assert.equal(service.barbershopId, shopA);
      assert.equal(service.currency, "USD");
      await assert.rejects(catalog.setCurrency(principal, shopA, "LBP"), /Currency cannot change/);
      await assert.rejects(database.barbershop.update({ where: { id: shopA }, data: { currency: "LBP" } }), { code: "P2003" });
      const events = await database.auditEvent.findMany({ where: { barbershopId: shopA }, orderBy: { createdAt: "asc" } });
      assert.deepEqual(events.map(event => event.event), ["catalog.currency_set", "catalog.service_created"]);
      assert(events.every(event => event.actorUserId === ownerId));
    });

    await t.test("rejects anonymous, cross-shop, staff and stale/forged owner claims", async () => {
      await assert.rejects(catalog.list(null, shopA), /Forbidden/);
      await assert.rejects(catalog.list(principal, shopB), /Forbidden/);
      for (const role of ["BARBER", "RECEPTIONIST", "OWNER"] as const) {
        const staff: StaffPrincipal = { userId: staffId, memberships: [{ barbershopId: shopA, role }] };
        await assert.rejects(catalog.setCurrency(staff, shopA, "USD"), /Forbidden/);
      }
      await database.shopMembership.update({ where: { id: ownerMembership.id }, data: { role: "BARBER" } });
      await assert.rejects(catalog.list(principal, shopA), /Forbidden/);
      await assert.rejects(catalog.setCurrency(principal, shopA, "USD"), /Forbidden/);
      assert.equal(await database.auditEvent.count({ where: { barbershopId: shopA } }), 0);
    });

    await t.test("deactivated shops cannot read or mutate their catalog", async () => {
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(catalog.list(principal, shopA), /Forbidden/);
      await assert.rejects(catalog.setCurrency(principal, shopA, "USD"), /Forbidden/);
    });

    await t.test("validates inputs without partial writes or audit events", async () => {
      await catalog.setCurrency(principal, shopA, "USD");
      for (const data of [
        { ...haircut, name: "   " }, { ...haircut, name: "x".repeat(101) },
        { ...haircut, durationMinutes: 0 }, { ...haircut, durationMinutes: 1.5 },
        { ...haircut, priceMinor: -1 }, { ...haircut, priceMinor: 2 ** 31 },
      ]) await assert.rejects(catalog.createService(principal, shopA, data), /Invalid service/);
      assert.equal(await database.service.count({ where: { barbershopId: shopA } }), 0);
      assert.equal(await database.auditEvent.count({ where: { barbershopId: shopA } }), 1);
      await assert.rejects(database.$executeRaw`
        INSERT INTO services (id, barbershop_id, name, duration_minutes, price_minor, currency, updated_at)
        VALUES (${randomUUID()}::uuid, ${shopA}::uuid, 'Invalid', 0, -1, 'USD', NOW())`);
    });

    await t.test("enforces tenant-safe service assignments and scoped mutations", async () => {
      await catalog.setCurrency(principal, shopA, "USD");
      await catalog.setCurrency(otherPrincipal, shopB, "USD");
      const serviceA = await catalog.createService(principal, shopA, haircut);
      const serviceB = await catalog.createService(otherPrincipal, shopB, haircut);
      const overrides = { durationMinutes: null, priceMinor: null };
      await assert.rejects(catalog.updateService(principal, shopA, serviceB.id, haircut), /Service not found/);
      await assert.rejects(catalog.archiveService(principal, shopA, serviceB.id), /Service not found/);
      await assert.rejects(catalog.setBarberService(principal, shopA, barberB.id, serviceA.id, overrides), /Barber not found/);
      await assert.rejects(catalog.setBarberService(principal, shopA, barberA.id, serviceB.id, overrides), /Service not found/);
      await assert.rejects(database.barberService.create({ data: { barbershopId: shopA, barberId: barberA.id, serviceId: serviceB.id } }), { code: "P2003" });
      await assert.rejects(database.barberService.create({ data: { barbershopId: shopA, barberId: barberB.id, serviceId: serviceA.id } }), { code: "P2003" });
      const loaded = await catalog.list(principal, shopA);
      assert.deepEqual(loaded.services.map(service => service.id), [serviceA.id]);
      assert.deepEqual(loaded.barbers.map(barber => barber.id), [barberA.id]);
    });

    await t.test("persisted overrides feed availability and null restores inherited values", async () => {
      await catalog.setCurrency(principal, shopA, "USD");
      const service = await catalog.createService(principal, shopA, haircut);
      const beard = await catalog.createService(principal, shopA, { name: "Beard", durationMinutes: 15, priceMinor: 500 });
      await catalog.setBarberService(principal, shopA, barberA.id, service.id, { durationMinutes: 45, priceMinor: 0 });
      await catalog.setBarberService(principal, shopA, barberA.id, beard.id, { durationMinutes: null, priceMinor: null });
      async function slots() {
        const loaded = await catalog.list(principal, shopA);
        return findAvailableSlots({ barbershopId: shopA, services: loaded.services, selectedServiceIds: [service.id, beard.id],
          barbers: loaded.barbers.map(barber => ({ ...barber, working: [{ start: 0, end: 120 * 60_000 }], unavailable: [] })),
          candidateStarts: [0], earliestStart: 0, latestStart: 0, bufferAfterMinutes: 10, closures: [] });
      }
      assert.equal((await slots())[0]!.durationMinutes, 60);
      assert.equal((await slots())[0]!.totalPriceMinor, 500);
      assert.equal((await slots())[0]!.occupiedEnd, 70 * 60_000);
      await catalog.setBarberService(principal, shopA, barberA.id, service.id, { durationMinutes: null, priceMinor: null });
      await catalog.updateService(principal, shopA, service.id, { ...haircut, durationMinutes: 20, priceMinor: 1200 });
      assert.equal((await slots())[0]!.durationMinutes, 35);
      assert.equal((await slots())[0]!.totalPriceMinor, 1700);
      await catalog.removeBarberService(principal, shopA, barberA.id, beard.id);
      assert.deepEqual(await slots(), []);
    });

    await t.test("archiving preserves records and excludes them from usable catalogs", async () => {
      await catalog.setCurrency(principal, shopA, "USD");
      const service = await catalog.createService(principal, shopA, haircut);
      await catalog.setBarberService(principal, shopA, barberA.id, service.id, { durationMinutes: null, priceMinor: null });
      await catalog.archiveService(principal, shopA, service.id);
      const loaded = await catalog.list(principal, shopA);
      assert.equal(loaded.services.length, 0);
      assert.equal(loaded.barbers[0]!.services.length, 0);
      assert((await database.service.findUniqueOrThrow({ where: { id: service.id } })).archivedAt);
      await assert.rejects(catalog.updateService(principal, shopA, service.id, haircut), /Service not found/);
      await assert.rejects(catalog.setBarberService(principal, shopA, barberA.id, service.id, { durationMinutes: null, priceMinor: null }), /Service not found/);
      assert.equal(await database.auditEvent.count({ where: { barbershopId: shopA, event: "catalog.service_archived" } }), 1);
    });
  } finally {
    const where = { barbershopId: { in: [shopA, shopB] } };
    try {
      await database.barberService.deleteMany({ where });
      await database.service.deleteMany({ where });
      await database.auditEvent.deleteMany({ where });
      await database.barber.deleteMany({ where });
      await database.shopMembership.deleteMany({ where });
      await database.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
      await database.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } });
    } finally { await database.$disconnect(); }
  }
});
