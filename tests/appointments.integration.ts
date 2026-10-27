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
      { id: shopA, name: "Reservation A", slug: `test-a-${shopA}` },
      { id: shopB, name: "Reservation B", slug: `test-b-${shopB}` },
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
    t.beforeEach(async () => { await database.appointment.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } }); });

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
      await database.appointment.deleteMany({ where });
      await database.client.deleteMany({ where });
      await database.barber.deleteMany({ where });
      await database.shopMembership.deleteMany({ where });
      await database.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });
      await database.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } });
    } finally { await database.$disconnect(); }
  }
});
