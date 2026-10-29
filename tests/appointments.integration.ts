import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma, type AppointmentStatus } from "../packages/database/src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL to a migrated local development database");
const database = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
const shopA = randomUUID();
const shopB = randomUUID();
const userId = randomUUID();
const secondUserId = randomUUID();
let barberA: string;
let anotherBarberA: string;
let barberB: string;
let clientA: string;
let clientB: string;
let serviceA: string;
let secondServiceA: string;
let serviceB: string;
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 1, 8, minutes));

interface Reservation {
  shop?: string;
  barber?: string;
  client?: string | null;
  status?: AppointmentStatus;
  start?: number;
  end?: number;
  occupied?: number;
}

async function reserve(input: Reservation = {}, db: Prisma.TransactionClient = database) {
  const id = randomUUID();
  // Raw SQL exposes PostgreSQL SQLSTATE through Prisma's P2010 metadata.
  await db.$executeRaw`
    INSERT INTO appointments (id, barbershop_id, barber_id, client_id, status,
      starts_at, service_ends_at, occupied_until, updated_at)
    VALUES (${id}::uuid, ${input.shop ?? shopA}::uuid, ${input.barber ?? barberA}::uuid,
      ${input.client ?? null}::uuid, ${input.status ?? "CONFIRMED"}::"AppointmentStatus",
      ${at(input.start ?? 0)}, ${at(input.end ?? 30)}, ${at(input.occupied ?? 40)}, NOW())`;
  return id;
}

function sqlState(code: string) {
  return (error: unknown) => error !== null && typeof error === "object" &&
    "code" in error && error.code === "P2010" && "meta" in error &&
    (error.meta as { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined)
      ?.driverAdapterError?.cause?.originalCode === code;
}

test("appointment reservation invariants in PostgreSQL", { timeout: 45_000 }, async t => {
  try {
    await database.barbershop.createMany({ data: [
      { id: shopA, name: "Reservation A", slug: `test-a-${shopA}`, currency: "USD" },
      { id: shopB, name: "Reservation B", slug: `test-b-${shopB}`, currency: "USD" },
    ] });
    await database.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const barbers = [];
    for (const shop of [shopA, shopB]) {
      const membership = await database.shopMembership.create({ data: { barbershopId: shop, userId, role: "OWNER" } });
      barbers.push(await database.barber.create({ data: { barbershopId: shop, membershipId: membership.id, displayName: "Test barber" } }));
    }
    barberA = barbers[0]!.id;
    barberB = barbers[1]!.id;
    await database.user.create({ data: { id: secondUserId, email: `${secondUserId}@example.invalid` } });
    const secondMembership = await database.shopMembership.create({ data: { barbershopId: shopA, userId: secondUserId, role: "BARBER" } });
    anotherBarberA = (await database.barber.create({ data: { barbershopId: shopA, membershipId: secondMembership.id, displayName: "Another barber" } })).id;
    clientA = (await database.client.create({ data: { barbershopId: shopA, name: "A", phone: "+96170000000" } })).id;
    clientB = (await database.client.create({ data: { barbershopId: shopB, name: "B", phone: "+96170000000" } })).id;
    const services = [];
    for (const shop of [shopA, shopA, shopB]) {
      services.push(await database.service.create({ data: {
        barbershopId: shop, name: "Haircut", durationMinutes: 30, priceMinor: 1500, currency: "USD",
      } }));
    }
    [serviceA, secondServiceA, serviceB] = services.map(service => service.id) as [string, string, string];
    t.beforeEach(async () => {
      const where = { barbershopId: { in: [shopA, shopB] } };
      await database.appointmentService.deleteMany({ where });
      await database.appointment.deleteMany({ where });
    });

    async function snapshot(appointmentId: string, overrides: Partial<Prisma.AppointmentServiceUncheckedCreateInput> = {}) {
      return database.appointmentService.create({ data: {
        barbershopId: shopA, appointmentId, serviceId: serviceA, position: 0,
        name: "Haircut", durationMinutes: 20, priceMinor: 1250, currency: "USD", ...overrides,
      } });
    }

    await t.test("snapshots reject cross-shop appointment and service references", async () => {
      const appointmentA = await reserve();
      const appointmentB = await reserve({ shop: shopB, barber: barberB });
      await assert.rejects(snapshot(appointmentA, { serviceId: serviceB }), { code: "P2003" });
      await assert.rejects(snapshot(appointmentB), { code: "P2003" });
      await assert.rejects(snapshot(appointmentA, { barbershopId: shopB, serviceId: serviceB }), { code: "P2003" });
      await snapshot(appointmentA);
      await snapshot(appointmentB, { barbershopId: shopB, serviceId: serviceB });
    });

    await t.test("ordered multi-service snapshots survive catalog edits and archiving", async () => {
      const appointmentId = await reserve();
      const first = await snapshot(appointmentId);
      const second = await snapshot(appointmentId, {
        serviceId: secondServiceA, position: 1, name: "Beard trim", durationMinutes: 10, priceMinor: 500,
      });
      await database.service.update({ where: { id: serviceA }, data: {
        name: "New haircut", durationMinutes: 45, priceMinor: 3000, archivedAt: new Date(),
      } });
      const saved = await database.appointmentService.findMany({
        where: { barbershopId: shopA, appointmentId }, orderBy: { position: "asc" },
      });
      assert.deepEqual(saved, [first, second]);
      assert.equal(saved.reduce((sum, row) => sum + row.durationMinutes, 0), 30);
      assert.equal(saved.reduce((sum, row) => sum + row.priceMinor, 0), 1750);
      await assert.rejects(database.service.delete({ where: { id: serviceA } }), { code: "P2003" });
      await assert.rejects(database.appointment.delete({ where: { id: appointmentId } }), { code: "P2003" });
    });

    await t.test("snapshots reject duplicate services/positions and invalid values", async () => {
      const appointmentId = await reserve();
      const saved = await snapshot(appointmentId);
      await assert.rejects(snapshot(appointmentId, { position: 1 }), { code: "P2002" });
      await assert.rejects(snapshot(appointmentId, { serviceId: secondServiceA }), { code: "P2002" });
      for (const [column, value] of [
        ["position", -1], ["duration_minutes", 0], ["duration_minutes", -1], ["price_minor", -1],
        ["name", "   "], ["currency", "usd"], ["currency", "US"],
      ] as const) {
        // Column names come only from the fixed test cases above; values stay parameterized.
        await assert.rejects(database.$executeRawUnsafe(
          `UPDATE appointment_services SET "${column}" = $1 WHERE id = $2::uuid`, value, saved.id,
        ), sqlState("23514"));
      }
      await database.appointmentService.update({ where: { id: saved.id }, data: { priceMinor: 0 } });
    });

    await t.test("tenant-safe barber/client relations, including guests", async () => {
      await assert.rejects(reserve({ shop: shopB, barber: barberA }), sqlState("23503"));
      await assert.rejects(reserve({ client: clientB }), sqlState("23503"));
      await reserve({ client: clientA });
      await reserve({ shop: shopB, barber: barberB, client: clientB });
      await reserve({ start: 40, end: 70, occupied: 70 });
    });

    await t.test("different barbers in the same shop can occupy the same time", async () => {
      await reserve();
      await reserve({ barber: anotherBarberA });
    });

    await t.test("buffers block overlaps and exact adjacent bounds remain available", async () => {
      await reserve();
      await assert.rejects(reserve({ start: 30, end: 50, occupied: 50 }), sqlState("23P01"));
      await assert.rejects(reserve({ start: -10, end: 50, occupied: 50 }), sqlState("23P01"));
      await reserve({ start: 40, end: 70, occupied: 70 });
      await reserve({ start: -30, end: 0, occupied: 0 });
    });

    await t.test("every non-cancelled status retains occupancy", async () => {
      for (const status of ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const) {
        const id = await reserve({ status });
        await assert.rejects(reserve(), sqlState("23P01"));
        await database.appointment.delete({ where: { id } });
      }
      await reserve({ status: "CANCELLED" });
      await reserve();
    });

    await t.test("cancellation releases time and conflicting reactivation/rescheduling fails", async () => {
      const cancelled = await reserve();
      await database.appointment.update({ where: { id: cancelled }, data: { status: "CANCELLED" } });
      await reserve();
      await assert.rejects(database.$executeRaw`UPDATE appointments SET status = 'CONFIRMED' WHERE id = ${cancelled}::uuid`, sqlState("23P01"));
      const later = await reserve({ start: 60, end: 90, occupied: 100 });
      await assert.rejects(database.$executeRaw`
        UPDATE appointments SET starts_at = ${at(20)}, service_ends_at = ${at(50)}, occupied_until = ${at(60)}
        WHERE id = ${later}::uuid`, sqlState("23P01"));
      assert.equal((await database.appointment.findUniqueOrThrow({ where: { id: later } })).startsAt.getTime(), at(60).getTime());
    });

    await t.test("invalid and infinite intervals fail even when cancelled", async () => {
      for (const status of ["CONFIRMED", "CANCELLED"] as const) {
        await assert.rejects(reserve({ start: 0, end: 0, occupied: 40, status }), sqlState("23514"));
        await assert.rejects(reserve({ start: 0, end: 40, occupied: 30, status }), sqlState("23514"));
      }
      const id = await reserve();
      await assert.rejects(database.$executeRaw`UPDATE appointments SET occupied_until = 'infinity'::timestamptz WHERE id = ${id}::uuid`, sqlState("23514"));
    });

    for (const rollback of [false, true]) await t.test(
      rollback ? "a waiting writer succeeds after the first reservation rolls back" : "concurrent transactions cannot both reserve a barber's interval",
      { timeout: 20_000 }, async () => {
      const rollbackReason = new Error("Intentional test rollback");
      let signalInserted!: (pid: number) => void;
      const inserted = new Promise<number>(resolve => { signalInserted = resolve; });
      let releaseFirst!: () => void;
      const holdFirst = new Promise<void>(resolve => { releaseFirst = resolve; });
      const first = database.$transaction(async tx => {
        const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await reserve({}, tx);
        signalInserted(row!.pid);
        await holdFirst;
        if (rollback) throw rollbackReason;
      }, { timeout: 15_000 });
      // Propagate setup failures instead of leaving the barrier pending.
      const firstPid = await Promise.race([inserted, first.then(() => { throw new Error("First writer finished before barrier"); })]);
      const second = database.$transaction(tx => reserve({ status: "PENDING" }, tx), { timeout: 15_000 });
      const results = Promise.allSettled([first, second]);
      try {
        // Prove the second writer is waiting on the first transaction's lock.
        // This avoids a test that accidentally performs two sequential writes.
        const deadline = Date.now() + 10_000;
        let waiting = false;
        while (Date.now() < deadline) {
          const [row] = await database.$queryRaw<{ waiting: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity WHERE ${firstPid}::integer = ANY(pg_blocking_pids(pid))
            ) AS waiting`;
          if (row!.waiting) { waiting = true; break; }
          await delay(20);
        }
        assert.equal(waiting, true, "Second writer must actually contend with the uncommitted reservation");
      } finally {
        releaseFirst();
        await results;
      }
      const settled = await results;
      const firstResult = settled[0]!;
      const secondResult = settled[1]!;
      if (rollback) {
        assert.equal(firstResult.status, "rejected");
        if (firstResult.status === "rejected") assert.equal(firstResult.reason, rollbackReason);
        assert.equal(secondResult.status, "fulfilled");
      } else {
        assert.equal(firstResult.status, "fulfilled");
        assert.equal(secondResult.status, "rejected");
        if (secondResult.status === "rejected") assert.ok(sqlState("23P01")(secondResult.reason));
      }
      assert.equal(await database.appointment.count({ where: { barbershopId: shopA } }), 1);
    });
  } finally {
    const where = { barbershopId: { in: [shopA, shopB] } };
    try {
      await database.appointmentService.deleteMany({ where });
      await database.appointment.deleteMany({ where });
      await database.service.deleteMany({ where });
      await database.client.deleteMany({ where });
      await database.barber.deleteMany({ where });
      await database.shopMembership.deleteMany({ where });
      await database.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });
      await database.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } });
    } finally { await database.$disconnect(); }
  }
});
