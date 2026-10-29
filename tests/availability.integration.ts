import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { StaffPrincipal } from "@barber/auth";
import { calendarRange, type BookingPolicy } from "@barber/shared";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createBookingAvailability, BookingPolicyMissingError } from "../packages/database/src/booking-availability";
import { createOwnerBookings, SlotUnavailableError, CancellationDeadlineError } from "../packages/database/src/bookings";
import { createBarberSchedules } from "../packages/database/src/schedules";
import { loadBookingSchedule } from "../packages/database/src/booking-schedule";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL to a migrated local development database");
const database = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const booking = createBookingAvailability(database), schedules = createBarberSchedules(database);
const shopA = randomUUID(), shopB = randomUUID(), userId = randomUUID();
const principal: StaffPrincipal = { userId, memberships: [{ barbershopId: shopA, role: "OWNER" }] };
const policy: BookingPolicy = { slotIntervalMinutes: 15, minimumNoticeMinutes: 60, bufferAfterMinutes: 15, cancellationNoticeMinutes: 120, reschedulingNoticeMinutes: 120, approvalMode: "MANUAL" };
const now = new Date("2026-07-01T05:00:00Z"); // 08:00 Beirut.

test("authoritative owner availability composes saved catalog, schedules, policies and occupancy", { timeout: 60_000 }, async t => {
  const where = { barbershopId: { in: [shopA, shopB] } };
  try {
    await database.barbershop.createMany({ data: [{ id: shopA, name: "Availability A", slug: `availability-${shopA}`, currency: "USD" }, { id: shopB, name: "Availability B", slug: `availability-${shopB}`, currency: "USD" }] });
    await database.user.create({ data: { id: userId, email: `${userId}@example.invalid` } });
    const member = await database.shopMembership.create({ data: { barbershopId: shopA, userId, role: "OWNER" } });
    const otherMember = await database.shopMembership.create({ data: { barbershopId: shopB, userId, role: "OWNER" } });
    const barber = await database.barber.create({ data: { barbershopId: shopA, membershipId: member.id, displayName: "A" } });
    const foreignBarber = await database.barber.create({ data: { barbershopId: shopB, membershipId: otherMember.id, displayName: "B" } });
    const hair = await database.service.create({ data: { barbershopId: shopA, name: "Hair", durationMinutes: 30, priceMinor: 1500, currency: "USD" } });
    const beard = await database.service.create({ data: { barbershopId: shopA, name: "Beard", durationMinutes: 15, priceMinor: 500, currency: "USD" } });
    const foreignService = await database.service.create({ data: { barbershopId: shopB, name: "Foreign", durationMinutes: 30, priceMinor: 100, currency: "USD" } });
    const client = await database.client.create({ data: { barbershopId: shopA, name: "Client A", phone: "+96170000001" } });
    const foreignClient = await database.client.create({ data: { barbershopId: shopB, name: "Client B", phone: "+96170000001" } });
    const reservations = createOwnerBookings(database, () => now);
    const reserveInput = { clientId: client.id, barberId: barber.id, serviceIds: [hair.id, beard.id], date: "2026-07-01", startsAt: Date.parse("2026-07-01T06:00Z") };
    const query = { date: "2026-07-01", serviceIds: [hair.id, beard.id] };
    t.beforeEach(async () => {
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: null } });
      await database.barberSchedulePeriod.deleteMany({ where }); await database.barberScheduleOverride.deleteMany({ where });
      await database.barberTimeOff.deleteMany({ where }); await database.shopClosure.deleteMany({ where });
      await database.appointmentService.deleteMany({ where });
      await database.appointment.deleteMany({ where }); await database.shopBookingPolicy.deleteMany({ where });
      await database.barberService.deleteMany({ where }); await database.auditEvent.deleteMany({ where });
      await database.service.updateMany({ where, data: { archivedAt: null } });
      await database.barberService.createMany({ data: [hair, beard].map(service => ({ barbershopId: shopA, barberId: barber.id, serviceId: service.id })) });
      await booking.savePolicy(principal, shopA, policy);
      await schedules.addPeriod(principal, shopA, barber.id, { dayOfWeek: 3, kind: "WORK", startMinute: 540, endMinute: 780, startOccurrence: null, endOccurrence: null });
      await schedules.addPeriod(principal, shopA, barber.id, { dayOfWeek: 3, kind: "BREAK", startMinute: 600, endMinute: 630, startOccurrence: null, endOccurrence: null });
    });
    await t.test("client registration and appointment reads enforce shop boundaries", async () => {
      const registered = await reservations.registerClient(principal, shopA, { name: " New client ", phone: "+96170999888" });
      assert((await reservations.clients(principal, shopA)).some(row => row.id === registered.id && row.name === "New client"));
      assert(!(await reservations.clients(principal, shopA)).some(row => row.id === foreignClient.id));
      await assert.rejects(reservations.registerClient(principal, shopA, { name: "Duplicate", phone: "+96170999888" }));
      await assert.rejects(reservations.registerClient(principal, shopA, { name: "Bad", phone: "70999888" }));
      await assert.rejects(reservations.clients(principal, shopB), /Forbidden/);
      await assert.rejects(reservations.day(principal, shopB, query.date), /Forbidden/);
      await assert.rejects(reservations.registerClient(null, shopA, { name: "Bad", phone: "+96170999889" }), /Forbidden/);
      const saved = await reservations.create(principal, shopA, { ...reserveInput, clientId: registered.id });
      const day = await reservations.day(principal, shopA, query.date);
      assert.equal(day.appointments.length, 1);
      assert.equal(day.appointments[0]!.id, saved.appointment.id);
      assert.equal(day.appointments[0]!.client?.name, "New client");
      assert.equal(day.appointments[0]!.services.length, 2);
      assert.equal((await reservations.day(principal, shopA, "2026-07-02")).appointments.length, 0);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
      await assert.rejects(reservations.clients(principal, shopA), /Forbidden/);
      await assert.rejects(reservations.day(principal, shopA, query.date), /Forbidden/);
    });
    await t.test("week and month reads preserve snapshots and enforce tenant and owner boundaries", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      await database.appointment.create({ data: { barbershopId: shopB, barberId: foreignBarber.id, status: "CONFIRMED", startsAt: saved.appointment.startsAt, serviceEndsAt: saved.appointment.serviceEndsAt, occupiedUntil: saved.appointment.occupiedUntil } });
      for (const view of ["week", "month"] as const) {
        const result = await reservations.calendar(principal, shopA, query.date, view);
        assert.equal(result.appointments.length, 1);
        assert.equal(result.appointments[0]!.id, saved.appointment.id);
        assert.equal(result.appointments[0]!.services.length, 2);
        assert.equal(result.days.length, view === "week" ? 7 : 35);
        await assert.rejects(reservations.calendar(null, shopA, query.date, view), /Forbidden/);
        await assert.rejects(reservations.calendar(principal, shopB, query.date, view), /Forbidden/);
      }
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
      await assert.rejects(reservations.calendar(principal, shopA, query.date, "week"), /Forbidden/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(reservations.calendar(principal, shopA, query.date, "month"), /Forbidden/);
    });
    await t.test("calendar ranges handle overnight buffers and exclusive boundaries across both Beirut DST changes", async () => {
      for (const date of ["2026-03-29", "2026-10-25"]) {
        const range = calendarRange(date, "week", "Asia/Beirut");
        const create = (start: number, end: number, status: "CONFIRMED" | "CANCELLED" = "CONFIRMED") => database.appointment.create({ data: {
          barbershopId: shopA, barberId: barber.id, startsAt: new Date(start), serviceEndsAt: new Date(end - 60_000), occupiedUntil: new Date(end), status,
        } });
        const before = await create(range.start - 7_200_000, range.start);
        const carry = await create(range.start - 3_600_000, range.start + 3_600_000, "CANCELLED");
        const last = await create(range.end - 3_600_000, range.end + 3_600_000);
        const after = await create(range.end, range.end + 7_200_000, "CANCELLED");
        const result = await reservations.calendar(principal, shopA, date, "week");
        assert.deepEqual(result.appointments.map(row => row.id), [carry.id, last.id]);
        assert(!result.appointments.some(row => row.id === before.id || row.id === after.id));
        // A buffer alone crossing midnight still appears on the following local day.
        const midnight = range.days[1]!.start;
        const buffered = await database.appointment.create({ data: { barbershopId: shopA, barberId: barber.id, status: "CONFIRMED", startsAt: new Date(midnight - 1_800_000), serviceEndsAt: new Date(midnight), occupiedUntil: new Date(midnight + 900_000) } });
        const day = await reservations.day(principal, shopA, range.days[1]!.date);
        assert(day.appointments.some(row => row.id === buffered.id));
      }
    });
    await t.test("rescheduling schedule lookup excludes only the authorized appointment and preserves other blockers", async () => {
      const own = await reservations.create(principal, shopA, reserveInput);
      const other = await reservations.create(principal, shopA, { ...reserveInput, startsAt: Date.parse("2026-07-01T08:00Z") });
      const input = { shopId: shopA, barberId: barber.id, timeZone: "Asia/Beirut", date: query.date, occupiedMinutes: 60,
        candidates: [reserveInput.startsAt, Date.parse("2026-07-01T09:00Z")] };
      const full = await database.$transaction(tx => loadBookingSchedule(tx, input));
      assert(full.unavailable.some(row => row.start === own.appointment.startsAt.getTime()));
      const moving = await database.$transaction(tx => loadBookingSchedule(tx, { ...input, excludedAppointmentId: own.appointment.id }));
      assert(!moving.unavailable.some(row => row.start === own.appointment.startsAt.getTime()));
      assert(moving.unavailable.some(row => row.start === other.appointment.startsAt.getTime() && row.end === other.appointment.occupiedUntil.getTime()));
      // The existing 10:00–10:30 shop-local break still applies during a move.
      assert(moving.unavailable.some(row => row.start === Date.parse("2026-07-01T07:00Z") && row.end === Date.parse("2026-07-01T07:30Z")));
      assert.deepEqual(moving.working, full.working);
      assert.deepEqual(moving.closures, full.closures);
    });
    await t.test("booking atomically saves authoritative overrides, snapshots, approval and audit", async () => {
      await database.barberService.update({ where: { barbershopId_barberId_serviceId: { barbershopId: shopA, barberId: barber.id, serviceId: beard.id } }, data: { priceMinor: 0, durationMinutes: 20 } });
      await booking.savePolicy(principal, shopA, { ...policy, bufferAfterMinutes: 5 });
      const saved = await reservations.create(principal, shopA, reserveInput);
      assert.equal(saved.appointment.status, "PENDING");
      assert.equal(saved.totalPriceMinor, 1500);
      assert.equal(saved.appointment.serviceEndsAt.toISOString(), "2026-07-01T06:50:00.000Z");
      assert.equal(saved.appointment.occupiedUntil.toISOString(), "2026-07-01T06:55:00.000Z");
      const lines = await database.appointmentService.findMany({ where: { barbershopId: shopA, appointmentId: saved.appointment.id }, orderBy: { position: "asc" } });
      assert.deepEqual(lines.map(({ serviceId, priceMinor, durationMinutes }) => ({ serviceId, priceMinor, durationMinutes })), [
        { serviceId: hair.id, priceMinor: 1500, durationMinutes: 30 }, { serviceId: beard.id, priceMinor: 0, durationMinutes: 20 },
      ]);
      assert.equal(await database.auditEvent.count({ where: { barbershopId: shopA, event: "booking.created" } }), 1);
      await booking.savePolicy(principal, shopA, { ...policy, approvalMode: "AUTOMATIC" });
      const confirmed = await reservations.create(principal, shopA, { ...reserveInput, startsAt: Date.parse("2026-07-01T08:00Z") });
      assert.equal(confirmed.appointment.status, "CONFIRMED");
    });
    await t.test("approval is tenant-scoped, atomic and preserves the reserved interval and snapshots", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      await assert.rejects(reservations.confirm(null, shopA, saved.appointment.id), /Forbidden/);
      await assert.rejects(reservations.confirm(principal, shopB, saved.appointment.id), /Forbidden/);
      const foreign = await database.appointment.create({ data: { barbershopId: shopB, barberId: foreignBarber.id, status: "PENDING", startsAt: saved.appointment.startsAt, serviceEndsAt: saved.appointment.serviceEndsAt, occupiedUntil: saved.appointment.occupiedUntil } });
      await assert.rejects(reservations.confirm(principal, shopA, foreign.id), /Pending appointment not found/);
      const results = await Promise.allSettled([reservations.confirm(principal, shopA, saved.appointment.id), reservations.confirm(principal, shopA, saved.appointment.id)]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const updated = await database.appointment.findUniqueOrThrow({ where: { id: saved.appointment.id } });
      assert.equal(updated.status, "CONFIRMED");
      assert.deepEqual(updated.startsAt, saved.appointment.startsAt);
      assert.deepEqual(updated.occupiedUntil, saved.appointment.occupiedUntil);
      assert.equal(await database.appointmentService.count({ where: { appointmentId: updated.id } }), 2);
      const audit = await database.auditEvent.findMany({ where: { ...where, event: "booking.confirmed" } });
      assert.equal(audit.length, 1);
      assert.equal(audit[0]!.actorUserId, userId);
      assert.deepEqual(audit[0]!.details, { appointmentId: updated.id, previousStatus: "PENDING", status: "CONFIRMED" });
      assert(!(await booking.search(principal, shopA, query, now)).slots.some(slot => slot.start === reserveInput.startsAt));
      for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
        await database.appointment.update({ where: { id: updated.id }, data: { status } });
        await assert.rejects(reservations.confirm(principal, shopA, updated.id), /Pending appointment not found/);
      }
    });
    await t.test("approval rechecks owner membership and shop activation and rolls back on audit failure", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
      await assert.rejects(reservations.confirm(principal, shopA, saved.appointment.id), /Forbidden/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(reservations.confirm(principal, shopA, saved.appointment.id), /Forbidden/);
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: null } });
      const failure = new Error("Injected approval audit failure");
      const failingDatabase = database.$extends({ query: { auditEvent: { create({ args, query }) {
        if (args.data.event === "booking.confirmed") throw failure;
        return query(args);
      } } } });
      await assert.rejects(createOwnerBookings(failingDatabase as unknown as PrismaClient).confirm(principal, shopA, saved.appointment.id), error => error === failure);
      assert.equal((await database.appointment.findUniqueOrThrow({ where: { id: saved.appointment.id } })).status, "PENDING");
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "booking.confirmed" } }), 0);
    });
    await t.test("cancellation enforces exact deadlines, preserves history and releases occupancy", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      const input = { expectedStatus: "PENDING" as const, overrideDeadline: false };
      await assert.rejects(reservations.cancel(principal, shopA, saved.appointment.id, input), CancellationDeadlineError);
      const cutoff = reserveInput.startsAt - policy.cancellationNoticeMinutes * 60_000;
      await assert.rejects(createOwnerBookings(database, () => new Date(cutoff + 1)).cancel(principal, shopA, saved.appointment.id, input), CancellationDeadlineError);
      await createOwnerBookings(database, () => new Date(cutoff)).cancel(principal, shopA, saved.appointment.id, input);
      const updated = await database.appointment.findUniqueOrThrow({ where: { id: saved.appointment.id } });
      assert.equal(updated.status, "CANCELLED");
      assert.deepEqual(updated.startsAt, saved.appointment.startsAt);
      assert.deepEqual(updated.occupiedUntil, saved.appointment.occupiedUntil);
      assert.equal(await database.appointmentService.count({ where: { appointmentId: updated.id } }), 2);
      assert((await booking.search(principal, shopA, query, now)).slots.some(slot => slot.start === reserveInput.startsAt));
      const audit = await database.auditEvent.findFirstOrThrow({ where: { ...where, event: "booking.cancelled" } });
      assert.equal(audit.actorUserId, userId);
      assert.deepEqual(audit.details, { appointmentId: updated.id, previousStatus: "PENDING", status: "CANCELLED", cancellationNoticeMinutes: 120, checkedAt: new Date(cutoff).toISOString(), deadlineOverridden: false });
      await reservations.create(principal, shopA, reserveInput);
    });
    await t.test("owner deadline override is explicit, audited and safe against concurrent and stale requests", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      await reservations.confirm(principal, shopA, saved.appointment.id);
      await assert.rejects(reservations.cancel(principal, shopA, saved.appointment.id, { expectedStatus: "PENDING", overrideDeadline: true }), /Appointment changed/);
      const input = { expectedStatus: "CONFIRMED" as const, overrideDeadline: true };
      const results = await Promise.allSettled([reservations.cancel(principal, shopA, saved.appointment.id, input), reservations.cancel(principal, shopA, saved.appointment.id, input)]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const audits = await database.auditEvent.findMany({ where: { ...where, event: "booking.cancelled" } });
      assert.equal(audits.length, 1);
      assert.equal((audits[0]!.details as { deadlineOverridden: boolean }).deadlineOverridden, true);
      for (const status of ["COMPLETED", "NO_SHOW"] as const) {
        await database.appointment.update({ where: { id: saved.appointment.id }, data: { status } });
        await assert.rejects(reservations.cancel(principal, shopA, saved.appointment.id, input), /Appointment changed/);
      }
    });
    await t.test("cancellation enforces tenant, owner, active shop and atomic audit boundaries", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      const input = { expectedStatus: "PENDING" as const, overrideDeadline: true };
      await assert.rejects(reservations.cancel(null, shopA, saved.appointment.id, input), /Forbidden/);
      await assert.rejects(reservations.cancel(principal, shopB, saved.appointment.id, input), /Forbidden/);
      const foreign = await database.appointment.create({ data: { barbershopId: shopB, barberId: foreignBarber.id, status: "PENDING", startsAt: saved.appointment.startsAt, serviceEndsAt: saved.appointment.serviceEndsAt, occupiedUntil: saved.appointment.occupiedUntil } });
      await assert.rejects(reservations.cancel(principal, shopA, foreign.id, input), /Appointment changed/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
      await assert.rejects(reservations.cancel(principal, shopA, saved.appointment.id, input), /Forbidden/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(reservations.cancel(principal, shopA, saved.appointment.id, input), /Forbidden/);
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: null } });
      const failure = new Error("Injected cancellation audit failure");
      const failingDatabase = database.$extends({ query: { auditEvent: { create({ args, query }) {
        if (args.data.event === "booking.cancelled") throw failure;
        return query(args);
      } } } });
      await assert.rejects(createOwnerBookings(failingDatabase as unknown as PrismaClient, () => now).cancel(principal, shopA, saved.appointment.id, input), error => error === failure);
      assert.equal((await database.appointment.findUniqueOrThrow({ where: { id: saved.appointment.id } })).status, "PENDING");
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "booking.cancelled" } }), 0);
      await database.shopBookingPolicy.deleteMany({ where });
      await assert.rejects(reservations.cancel(principal, shopA, saved.appointment.id, input), /Booking policy missing/);
    });
    await t.test("both outcomes preserve appointment details, service snapshots and occupied time", async () => {
      for (const outcome of ["COMPLETED", "NO_SHOW"] as const) {
        const startsAt = outcome === "COMPLETED" ? reserveInput.startsAt : Date.parse("2026-07-01T08:00Z");
        const saved = await reservations.create(principal, shopA, { ...reserveInput, startsAt });
        const expectedStatus = outcome === "COMPLETED" ? "PENDING" : "CONFIRMED";
        if (expectedStatus === "CONFIRMED") await reservations.confirm(principal, shopA, saved.appointment.id);
        const before = await database.appointment.findUniqueOrThrow({ where: { id: saved.appointment.id } });
        const lines = await database.appointmentService.findMany({ where: { appointmentId: before.id }, orderBy: { position: "asc" } });
        await reservations.recordOutcome(principal, shopA, before.id, { expectedStatus, outcome });
        const after = await database.appointment.findUniqueOrThrow({ where: { id: before.id } });
        assert.equal(after.status, outcome);
        for (const key of ["startsAt", "serviceEndsAt", "occupiedUntil", "clientId", "barberId"] as const) assert.deepEqual(after[key], before[key]);
        assert.deepEqual(await database.appointmentService.findMany({ where: { appointmentId: before.id }, orderBy: { position: "asc" } }), lines);
        assert(!(await booking.search(principal, shopA, query, now)).slots.some(slot => slot.start === startsAt));
        const audit = await database.auditEvent.findFirstOrThrow({ where: { ...where, event: outcome === "COMPLETED" ? "booking.completed" : "booking.no_show" } });
        assert.equal(audit.actorUserId, userId);
        assert.deepEqual(audit.details, { appointmentId: before.id, previousStatus: expectedStatus, status: outcome });
      }
    });
    await t.test("competing outcomes and stale forms cannot overwrite an appointment", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      await reservations.confirm(principal, shopA, saved.appointment.id);
      await assert.rejects(reservations.recordOutcome(principal, shopA, saved.appointment.id, { expectedStatus: "PENDING", outcome: "COMPLETED" }), /Appointment changed/);
      const results = await Promise.allSettled([
        reservations.recordOutcome(principal, shopA, saved.appointment.id, { expectedStatus: "CONFIRMED", outcome: "COMPLETED" }),
        reservations.recordOutcome(principal, shopA, saved.appointment.id, { expectedStatus: "CONFIRMED", outcome: "NO_SHOW" }),
      ]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(await database.auditEvent.count({ where: { ...where, event: { in: ["booking.completed", "booking.no_show"] } } }), 1);
      for (const status of ["COMPLETED", "NO_SHOW", "CANCELLED"] as const) {
        await database.appointment.update({ where: { id: saved.appointment.id }, data: { status } });
        for (const outcome of ["COMPLETED", "NO_SHOW"] as const) {
          await assert.rejects(reservations.recordOutcome(principal, shopA, saved.appointment.id, { expectedStatus: "CONFIRMED", outcome }), /Appointment changed/);
        }
      }
    });
    await t.test("outcome writes recheck tenant ownership and shop activation, and roll back on audit failure", async () => {
      const saved = await reservations.create(principal, shopA, reserveInput);
      const input = { expectedStatus: "PENDING" as const, outcome: "COMPLETED" as const };
      await assert.rejects(reservations.recordOutcome(null, shopA, saved.appointment.id, input), /Forbidden/);
      await assert.rejects(reservations.recordOutcome(principal, shopB, saved.appointment.id, input), /Forbidden/);
      const foreign = await database.appointment.create({ data: { barbershopId: shopB, barberId: foreignBarber.id, status: "PENDING", startsAt: saved.appointment.startsAt, serviceEndsAt: saved.appointment.serviceEndsAt, occupiedUntil: saved.appointment.occupiedUntil } });
      await assert.rejects(reservations.recordOutcome(principal, shopA, foreign.id, input), /Appointment changed/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
      await assert.rejects(reservations.recordOutcome(principal, shopA, saved.appointment.id, input), /Forbidden/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(reservations.recordOutcome(principal, shopA, saved.appointment.id, input), /Forbidden/);
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: null } });
      const failure = new Error("Injected outcome audit failure");
      const failingDatabase = database.$extends({ query: { auditEvent: { create({ args, query }) {
        if (["booking.completed", "booking.no_show"].includes(args.data.event)) throw failure;
        return query(args);
      } } } });
      for (const outcome of ["COMPLETED", "NO_SHOW"] as const) {
        await assert.rejects(createOwnerBookings(failingDatabase as unknown as PrismaClient).recordOutcome(principal, shopA, saved.appointment.id, { ...input, outcome }), error => error === failure);
        assert.equal((await database.appointment.findUniqueOrThrow({ where: { id: saved.appointment.id } })).status, "PENDING");
      }
      assert.equal(await database.auditEvent.count({ where: { ...where, event: { in: ["booking.completed", "booking.no_show"] } } }), 0);
    });
    await t.test("booking revalidates stale search results and rejects off-grid instants", async () => {
      assert((await booking.search(principal, shopA, query, now)).slots.length > 0);
      await schedules.addClosure(principal, shopA, query.date);
      await assert.rejects(reservations.create(principal, shopA, reserveInput), SlotUnavailableError);
      await database.shopClosure.deleteMany({ where });
      await assert.rejects(reservations.create(principal, shopA, { ...reserveInput, startsAt: reserveInput.startsAt + 1 }), SlotUnavailableError);
      await assert.rejects(reservations.create(principal, shopA, { ...reserveInput, date: "2026-08-01" }), SlotUnavailableError);
      await assert.rejects(reservations.create(principal, shopA, { ...reserveInput, startsAt: Date.parse("2026-07-01T05:30Z") }), SlotUnavailableError);
      assert.equal(await database.appointment.count({ where }), 0);
      assert.equal(await database.appointmentService.count({ where }), 0);
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "booking.created" } }), 0);
    });
    await t.test("booking enforces tenant, role and active catalog boundaries", async () => {
      await assert.rejects(reservations.create(null, shopA, reserveInput), /Forbidden/);
      await assert.rejects(reservations.create(principal, shopB, reserveInput), /Forbidden/);
      await assert.rejects(reservations.create(principal, shopA, { ...reserveInput, clientId: foreignClient.id }), /Client not found/);
      await assert.rejects(reservations.create(principal, shopA, { ...reserveInput, barberId: foreignBarber.id }), /Barber not found/);
      await assert.rejects(reservations.create(principal, shopA, { ...reserveInput, serviceIds: [foreignService.id] }), /Service not found/);
      await assert.rejects(reservations.create(principal, shopA, { ...reserveInput, serviceIds: [hair.id, hair.id] }), /unique services/);
      await database.service.update({ where: { id: hair.id }, data: { archivedAt: new Date() } });
      await assert.rejects(reservations.create(principal, shopA, reserveInput), /Service not found/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
      await assert.rejects(reservations.create(principal, shopA, reserveInput), /Forbidden/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(reservations.create(principal, shopA, reserveInput), /Forbidden/);
      assert.equal(await database.appointment.count({ where }), 0);
    });
    await t.test("an audit failure rolls back the appointment and every service snapshot", async () => {
      const failure = new Error("Injected audit failure");
      const failingDatabase = database.$extends({ query: { auditEvent: { create({ args, query }) {
        if (args.data.event === "booking.created") throw failure;
        return query(args);
      } } } });
      const failingBookings = createOwnerBookings(failingDatabase as unknown as PrismaClient, () => now);
      await assert.rejects(failingBookings.create(principal, shopA, reserveInput), error => error === failure);
      assert.equal(await database.appointment.count({ where }), 0);
      assert.equal(await database.appointmentService.count({ where }), 0);
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "booking.created" } }), 0);
    });
    await t.test("concurrent owner requests produce one booking, one snapshot set and one audit", async () => {
      const results = await Promise.allSettled([
        reservations.create(principal, shopA, reserveInput), reservations.create(principal, shopA, reserveInput),
      ]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const rejected = results.find(result => result.status === "rejected");
      assert(rejected?.status === "rejected" && rejected.reason instanceof SlotUnavailableError);
      assert.equal(await database.appointment.count({ where }), 1);
      assert.equal(await database.appointmentService.count({ where }), 2);
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "booking.created" } }), 1);
    });
    await t.test("requires explicit policies and preserves a transactional audit", async () => {
      assert.deepEqual(await booking.policy(principal, shopA), policy);
      assert.equal(await database.auditEvent.count({ where: { ...where, event: "booking.policy_saved" } }), 1);
      await assert.rejects(booking.savePolicy(principal, shopA, { ...policy, slotIntervalMinutes: 0 }));
      assert.deepEqual(await booking.policy(principal, shopA), policy);
      await database.shopBookingPolicy.deleteMany({ where });
      await assert.rejects(booking.search(principal, shopA, query, now), BookingPolicyMissingError);
    });
    await t.test("loads prices, sums durations and respects pending occupancy including its buffer", async () => {
      const appointment = await database.appointment.create({ data: { barbershopId: shopA, barberId: barber.id, status: "PENDING", startsAt: new Date("2026-07-01T08:00Z"), serviceEndsAt: new Date("2026-07-01T08:30Z"), occupiedUntil: new Date("2026-07-01T08:45Z") } });
      const result = await booking.search(principal, shopA, query, now);
      assert.deepEqual(result.slots.map(slot => slot.start), ["2026-07-01T06:00Z", "2026-07-01T08:45Z", "2026-07-01T09:00Z"].map(Date.parse));
      assert(result.slots.every(slot => slot.totalPriceMinor === 2000 && slot.durationMinutes === 45));
      assert.equal(result.approvalMode, "MANUAL");
      assert.equal(await database.appointment.count({ where }), 1); // Search never reserves anything.
      await database.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELLED" } });
      assert((await booking.search(principal, shopA, query, now)).slots.some(slot => slot.start === Date.parse("2026-07-01T07:30Z")));
      for (const status of ["CONFIRMED", "COMPLETED", "NO_SHOW"] as const) {
        await database.appointment.update({ where: { id: appointment.id }, data: { status } });
        assert(!(await booking.search(principal, shopA, query, now)).slots.some(slot => slot.start === Date.parse("2026-07-01T07:30Z")));
      }
    });
    await t.test("barber overrides and explicit support determine availability", async () => {
      await database.barberService.update({ where: { barbershopId_barberId_serviceId: { barbershopId: shopA, barberId: barber.id, serviceId: beard.id } }, data: { priceMinor: 0, durationMinutes: 20 } });
      const result = await booking.search(principal, shopA, { ...query, barberId: barber.id }, now);
      assert(result.slots.length > 0);
      assert(result.slots.every(slot => slot.durationMinutes === 50 && slot.totalPriceMinor === 1500));
      await database.barberService.deleteMany({ where: { barbershopId: shopA, serviceId: beard.id } });
      assert.deepEqual((await booking.search(principal, shopA, query, now)).slots, []);
    });
    await t.test("closures, time off and empty replacements block saved schedules", async () => {
      await schedules.addTimeOff(principal, shopA, barber.id, { start: { date: query.date, time: "09:00" }, end: { date: query.date, time: "13:00" } });
      assert.deepEqual((await booking.search(principal, shopA, query, now)).slots, []);
      await database.barberTimeOff.deleteMany({ where });
      const closure = await schedules.addClosure(principal, shopA, query.date);
      assert.deepEqual((await booking.search(principal, shopA, query, now)).slots, []);
      await schedules.removeClosure(principal, shopA, closure.id);
      await schedules.saveOverride(principal, shopA, barber.id, query.date, []);
      assert.deepEqual((await booking.search(principal, shopA, query, now)).slots, []);
    });
    await t.test("overnight service buffers cannot cross a next-day closure", async () => {
      await database.barberSchedulePeriod.deleteMany({ where });
      await schedules.addPeriod(principal, shopA, barber.id, { dayOfWeek: 3, kind: "WORK", startMinute: 1320, endMinute: 1560, startOccurrence: null, endOccurrence: null });
      await schedules.addClosure(principal, shopA, "2026-07-02");
      const result = await booking.search(principal, shopA, query, now);
      assert(result.slots.length > 0);
      assert(result.slots.every(slot => slot.occupiedEnd <= Date.parse("2026-07-01T21:00Z")));
    });
    await t.test("tenant, role, archive and horizon boundaries reject unsafe requests", async () => {
      await assert.rejects(booking.search(null, shopA, query, now), /Forbidden/);
      await assert.rejects(booking.search(principal, shopB, query, now), /Forbidden/);
      await assert.rejects(booking.search(principal, shopA, { ...query, serviceIds: [foreignService.id] }, now), /Service not found/);
      await assert.rejects(booking.search(principal, shopA, { ...query, barberId: foreignBarber.id }, now), /Barber not found/);
      assert.deepEqual((await booking.search(principal, shopA, { ...query, date: "2026-08-01" }, now)).slots, []);
      await database.service.update({ where: { id: hair.id }, data: { archivedAt: new Date() } });
      await assert.rejects(booking.search(principal, shopA, query, now), /Service not found/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "BARBER" } });
      await assert.rejects(booking.savePolicy(principal, shopA, policy), /Forbidden/);
      await database.shopMembership.update({ where: { id: member.id }, data: { role: "OWNER" } });
      await database.barbershop.update({ where: { id: shopA }, data: { deletedAt: new Date() } });
      await assert.rejects(booking.search(principal, shopA, query, now), /Forbidden/);
    });
  } finally {
    try {
      await database.barberSchedulePeriod.deleteMany({ where }); await database.barberScheduleOverride.deleteMany({ where });
      await database.barberTimeOff.deleteMany({ where }); await database.shopClosure.deleteMany({ where });
      await database.appointmentService.deleteMany({ where });
      await database.appointment.deleteMany({ where }); await database.shopBookingPolicy.deleteMany({ where });
      await database.barberService.deleteMany({ where }); await database.service.deleteMany({ where }); await database.auditEvent.deleteMany({ where });
      await database.client.deleteMany({ where });
      await database.barber.deleteMany({ where }); await database.shopMembership.deleteMany({ where });
      await database.user.deleteMany({ where: { id: userId } }); await database.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } });
    } finally { await database.$disconnect(); }
  }
});
