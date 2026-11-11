import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import sharp from "sharp";
import { createMediaRepository } from "../packages/database/src/media";
import type { ObjectStorage } from "../packages/storage/src/local-object-storage";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { hashPassword, verifyAccountPassword } from "../packages/auth/src/password-core";
import { createClientAccounts } from "../packages/database/src/client-accounts";
import { createClientBookings } from "../packages/database/src/client-bookings";
import { SlotUnavailableError } from "../packages/database/src/bookings";
import { createStaffAccounts } from "../packages/database/src/staff-accounts";
import { createStaffTeam } from "../packages/database/src/staff-team";
import { createShopPayments } from "../packages/database/src/payments";
import { createPlatformAdministration } from "../packages/database/src/platform-admin";
import { withStaffAccess } from "../packages/database/src/staff-access";
import { shopCalendarDate } from "@barber/shared";

test("client accounts, booking lifecycle, receipts, invitations and platform controls", { timeout: 60_000 }, async t => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");
  const schema = `operations_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema},public` });
  const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const root = new URL("../packages/database/prisma/migrations/", import.meta.url);
    for (const name of (await readdir(root)).filter(name => /^\d/.test(name)).sort()) await pool.query(await readFile(new URL(`${name}/migration.sql`, root), "utf8"));
    const owner = await db.user.create({ data: { email: "owner@example.invalid" } });
    const shop = await db.barbershop.create({ data: { name: "Operations", slug: "operations", currency: "USD", publishedAt: new Date() } });
    const other = await db.barbershop.create({ data: { name: "Other", slug: "other-shop", currency: "USD", publishedAt: new Date() } });
    const membership = await db.shopMembership.create({ data: { userId: owner.id, barbershopId: shop.id, role: "OWNER" } });
    const principal = { userId: owner.id, memberships: [{ barbershopId: shop.id, role: "OWNER" as const }] };
    const barber = await db.barber.create({ data: { barbershopId: shop.id, membershipId: membership.id, displayName: "Barber" } });
    const service = await db.service.create({ data: { barbershopId: shop.id, name: "Haircut", priceMinor: 1500, durationMinutes: 30, currency: "USD" } });
    await db.barberService.create({ data: { barbershopId: shop.id, barberId: barber.id, serviceId: service.id } });
    await db.barberSchedulePeriod.createMany({ data: Array.from({ length: 7 }, (_, i) => ({ barbershopId: shop.id, barberId: barber.id, dayOfWeek: i + 1, kind: "WORK", startMinute: 540, endMinute: 1080 })) });
    await db.shopBookingPolicy.create({ data: { barbershopId: shop.id, slotIntervalMinutes: 15, minimumNoticeMinutes: 0, bufferAfterMinutes: 10, cancellationNoticeMinutes: 0, reschedulingNoticeMinutes: 0, approvalMode: "AUTOMATIC" } });
    const passwords = { hashPassword, verifyAccountPassword };
    const accounts = createClientAccounts(db, passwords), bookings = createClientBookings(db);
    const profile = { name: "Client", phone: "+96170123456", email: "", birthday: "", password: "local-test-password-123" };
    const signedIn = await accounts.register(shop.slug, profile);
    const client = await accounts.authenticate(shop.slug, signedIn.token);
    assert(client);
    await t.test("phone uniqueness and sessions remain shop-specific", async () => {
      await assert.rejects(accounts.register(shop.slug, profile));
      const elsewhere = await accounts.register(other.slug, profile);
      assert.equal(await accounts.authenticate(other.slug, signedIn.token), null);
      assert.equal(await accounts.authenticate(shop.slug, elsewhere.token), null);
      assert.notEqual((await accounts.authenticate(other.slug, elsewhere.token))?.id, client.id);
      await assert.rejects(accounts.login(shop.slug, profile.phone, "wrong-password"), /Invalid credentials/);
    });
    const date = shopCalendarDate(new Date(Date.now() + 86_400_000), "Asia/Beirut");
    const query = { date, serviceIds: [service.id], barberId: barber.id };
    const available = await bookings.search(shop.slug, query);
    const slot = available.slots[0]!;
    const appointment = await bookings.create(shop.slug, signedIn.token, { ...query, startsAt: slot.start });
    await t.test("client bookings persist and cannot be claimed through another session", async () => {
      assert.equal(appointment.status, "CONFIRMED");
      assert.equal((await bookings.dashboard(shop.slug, signedIn.token, "upcoming"))?.appointments[0]?.id, appointment.id);
      assert.equal(await bookings.dashboard(shop.slug, undefined, "upcoming"), null);
      await assert.rejects(bookings.create(shop.slug, signedIn.token, { ...query, startsAt: slot.start }), SlotUnavailableError);
      await assert.rejects(bookings.rescheduleOptions(shop.slug, undefined, appointment.id, date), /Sign in required/);
    });
    await t.test("client moves keep saved prices, trigger manual review and reject stale forms", async () => {
      await db.service.update({ where: { id: service.id }, data: { priceMinor: 9900, durationMinutes: 60 } });
      await db.shopBookingPolicy.update({ where: { barbershopId: shop.id }, data: { approvalMode: "MANUAL" } });
      const options = await bookings.rescheduleOptions(shop.slug, signedIn.token, appointment.id, date);
      const move = { expectedStartsAt: appointment.startsAt, date, startsAt: options.starts[0]! };
      await bookings.reschedule(shop.slug, signedIn.token, appointment.id, move);
      await assert.rejects(bookings.reschedule(shop.slug, signedIn.token, appointment.id, move), /Appointment changed/);
      const saved = await db.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { services: true } });
      assert.equal(saved.status, "PENDING");
      assert.equal(saved.services[0]?.priceMinor, 1500);
      assert.equal(saved.serviceEndsAt.getTime() - saved.startsAt.getTime(), 30 * 60_000);
    });
    await t.test("receipts use saved prices, reject duplicates and audit corrections", async () => {
      const payments = createShopPayments(db);
      await assert.rejects(payments.record(null, shop.id, appointment.id), /Forbidden/);
      await assert.rejects(payments.record(principal, other.id, appointment.id), /Forbidden/);
      const payment = await payments.record(principal, shop.id, appointment.id);
      assert.equal((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).amountMinor, 1500n);
      await assert.rejects(payments.record(principal, shop.id, appointment.id), /Already paid/);
      const today = shopCalendarDate(new Date(), "Asia/Beirut");
      assert.equal((await payments.report(principal, shop.id, today, today)).revenue[0]?.amountMinor, "1500");
      await payments.void(principal, shop.id, payment.id, "Wrong receipt");
      assert.equal((await payments.report(principal, shop.id, today, today)).revenue.length, 0);
      await assert.rejects(payments.void(principal, shop.id, payment.id, "Again"), /Payment changed/);
    });
    await t.test("cancellation moves the appointment to history", async () => {
      const saved = await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      await bookings.cancel(shop.slug, signedIn.token, appointment.id, saved.startsAt.toISOString());
      assert.equal((await bookings.dashboard(shop.slug, signedIn.token, "upcoming"))?.total, 0);
      assert.equal((await bookings.dashboard(shop.slug, signedIn.token, "history"))?.appointments[0]?.status, "CANCELLED");
    });
    await t.test("image consent, tenant access, replacement and removal protect private photos", async () => {
      const objects = new Map<string, Uint8Array>();
      const storage: ObjectStorage = {
        async write(key, bytes) { objects.set(key, bytes); },
        async read(key) { const bytes = objects.get(key); if (!bytes) throw new Error("Missing image"); return bytes; },
        async remove(key) { objects.delete(key); },
      };
      const media = createMediaRepository(db, storage);
      const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#2563eb" } }).png().toBuffer();
      const upload = { bytes, contentType: "image/png" };
      await assert.rejects(media.clientUpload(shop.slug, signedIn.token, "PROFILE", upload, false), /consent/);
      await assert.rejects(media.clientUpload(shop.slug, signedIn.token, "PROFILE", { ...upload, contentType: "image/jpeg" }, true), /Invalid image/);
      const photo = await media.clientUpload(shop.slug, signedIn.token, "PROFILE", upload, true);
      assert((await media.clientRead(shop.slug, signedIn.token, photo.id)).length > 0);
      await assert.rejects(media.clientRead(other.slug, signedIn.token, photo.id), /Sign in required/);
      await assert.rejects(media.ownerRead(principal, other.id, photo.id), /Forbidden/);
      const replacement = await media.clientUpload(shop.slug, signedIn.token, "PROFILE", upload, true);
      await assert.rejects(media.clientRead(shop.slug, signedIn.token, photo.id), /Photo unavailable/);
      assert.equal(objects.size, 1);
      await media.clientRemove(shop.slug, signedIn.token, replacement.id);
      assert.equal(objects.size, 0);
      assert.equal((await media.clientList(shop.slug, signedIn.token)).total, 0);
      const logo = await media.ownerUpload(principal, shop.id, null, "SHOP_LOGO", upload, true);
      assert((await media.publicLogo(shop.slug)).length > 0);
      await media.ownerRemove(principal, shop.id, null, logo.id);
      await assert.rejects(media.publicLogo(shop.slug), /Logo unavailable/);
    });
    await t.test("verified recovery codes are single-use and revoke old sessions", async () => {
      await assert.rejects(accounts.issueReset(principal, shop.id, client.id, false), /Verify identity/);
      const reset = await accounts.issueReset(principal, shop.id, client.id, true);
      const input = { phone: profile.phone, code: reset.code, password: "replacement-password-123" };
      await accounts.reset(shop.slug, input);
      assert.equal(await accounts.authenticate(shop.slug, signedIn.token), null);
      await assert.rejects(accounts.reset(shop.slug, input), /Invalid recovery code/);
      const login = await accounts.login(shop.slug, profile.phone, input.password);
      assert.equal((await accounts.authenticate(shop.slug, login.token))?.id, client.id);
    });
    await t.test("staff invites are single-use and permissions are rechecked live", async () => {
      const team = createStaffTeam(db), staff = createStaffAccounts(db, passwords);
      const email = "barber@example.invalid";
      const invite = await team.invite(principal, shop.id, { email, displayName: "Invited barber", role: "BARBER", manageAppointments: true, manageSchedules: false });
      const input = { email, code: invite.code, password: "invited-password-123" };
      const session = await staff.acceptInvite(input);
      const memberPrincipal = await staff.authenticate(session.token);
      assert(memberPrincipal);
      await assert.rejects(staff.acceptInvite(input));
      const member = await db.shopMembership.findUniqueOrThrow({ where: { barbershopId_userId: { barbershopId: shop.id, userId: memberPrincipal.userId } } });
      assert(await withStaffAccess(db, memberPrincipal, shop.id, "appointments", async (_tx, _shop, _actor, access) => access.barberId));
      await assert.rejects(withStaffAccess(db, memberPrincipal, shop.id, "schedules", async () => true), /Forbidden/);
      await team.access(principal, shop.id, member.id, true);
      await assert.rejects(withStaffAccess(db, memberPrincipal, shop.id, "appointments", async () => true), /Forbidden/);
    });
    await t.test("platform access is explicit, audited and suspension blocks public access", async () => {
      const platform = createPlatformAdministration(db);
      await assert.rejects(platform.list(principal), /Forbidden/);
      await db.platformAdmin.create({ data: { userId: owner.id } });
      assert.equal((await platform.list(principal)).total, 2);
      assert.equal((await platform.support(principal, shop.id))?.shop.id, shop.id);
      await platform.suspend(principal, shop.id, true, "Test suspension");
      await assert.rejects(bookings.storefront(shop.slug), /Shop unavailable/);
      await platform.suspend(principal, shop.id, false, "Test restored");
      assert.equal((await bookings.storefront(shop.slug)).shop.id, shop.id);
      assert.equal(await db.platformAuditEvent.count(), 4);
    });
  } finally {
    await db.$disconnect();
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await admin.end(); }
  }
});
