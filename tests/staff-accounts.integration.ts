import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createStaffAccounts } from "../packages/database/src/staff-accounts";
import { createStaffTeam } from "../packages/database/src/staff-team";
import { withStaffAccess } from "../packages/database/src/staff-access";
import { createServiceCatalog } from "../packages/database/src/catalog";
import { hashPassword, verifyAccountPassword } from "../packages/auth/src/password-core";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL to a migrated local development database");
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

// Isolate global rate-limit keys and anonymous audit events from development data.
test("staff registration, sessions and database rate limits", { timeout: 60_000 }, async t => {
  const schema = `auth_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema},public` });
  const database = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  const accounts = createStaffAccounts(database, { hashPassword, verifyAccountPassword });
  const input = { email: "owner@example.invalid", password: "test-only-long-password", shopName: "Test Shop", slug: "test-shop", currency: "USD" };
  try {
    const extension = await admin.query("SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'");
    assert.equal(extension.rowCount, 1, "Apply development database migrations before running account tests");
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const root = new URL("../packages/database/prisma/migrations/", import.meta.url);
    for (const name of (await readdir(root)).filter(name => /^\d/.test(name)).sort()) {
      await pool.query(await readFile(new URL(`${name}/migration.sql`, root), "utf8"));
    }
    t.beforeEach(async () => { await database.authRateLimit.deleteMany(); });
    const administrator = await database.user.create({ data: { email: "platform@example.invalid", passwordHash: await hashPassword(input.password) } });
    await database.platformAdmin.create({ data: { userId: administrator.id } });
    const adminPrincipal = { userId: administrator.id, memberships: [] };
    const adminSession = await accounts.login(administrator.email, input.password);
    await accounts.provision(adminPrincipal, { ...input, email: " Owner@Example.Invalid " });
    const registered = await accounts.login(input.email, input.password, undefined, input.slug);
    const owner = await database.user.findUniqueOrThrow({ where: { email: input.email } });
    const shop = await database.barbershop.findUniqueOrThrow({ where: { slug: input.slug } });

    await t.test("registration hashes secrets, creates ownership and leaves storefront unpublished", async () => {
      assert.notEqual(owner.passwordHash, input.password);
      assert(await verifyAccountPassword(input.password, owner.passwordHash));
      assert.equal(shop.publishedAt, null);
      assert.equal(await database.barber.count(), 0);
      assert.deepEqual(await accounts.authenticate(registered.token), { userId: owner.id, memberships: [{ barbershopId: shop.id, role: "OWNER" }] });
      assert.equal(await database.staffSession.count({ where: { tokenHash: registered.token } }), 0);
      assert(await database.staffSession.findUnique({ where: { tokenHash: digest(registered.token) } }));
      assert.equal(await database.auditEvent.count({ where: { event: "shop.provisioned", actorUserId: administrator.id, barbershopId: shop.id } }), 1);
    });
    await t.test("only platform administrators create shops and admin sessions are preserved", async () => {
      const ownerPrincipal = { userId: owner.id, memberships: [{ barbershopId: shop.id, role: "OWNER" as const }] };
      await assert.rejects(accounts.provision(null, input), /Forbidden/);
      await assert.rejects(accounts.provision(ownerPrincipal, input), /Forbidden/);
      await assert.rejects(accounts.provision({ userId: owner.id, memberships: [] }, input), /Forbidden/);
      assert.deepEqual(await accounts.authenticate(adminSession.token), adminPrincipal);
      assert.equal(await database.barbershop.count(), 1);
      assert.equal(await database.staffSession.count({ where: { userId: owner.id } }), 1, "provisioning never signs in as the owner");
    });
    await t.test("platform and shop logins reject the wrong role or shop", async () => {
      await assert.rejects(accounts.login(input.email, input.password), { code: "INVALID_CREDENTIALS" });
      await assert.rejects(accounts.login(input.email, input.password, undefined, "another-shop"), { code: "INVALID_CREDENTIALS" });
      await assert.rejects(accounts.login(administrator.email, input.password, undefined, input.slug), { code: "INVALID_CREDENTIALS" });
      assert.deepEqual(await accounts.authenticate(adminSession.token), adminPrincipal);
    });
    await t.test("duplicate identities/slugs roll back every registration write", async () => {
      for (const change of [{ email: input.email.toUpperCase(), slug: "another-shop" }, { email: "other@example.invalid" }]) {
        await assert.rejects(accounts.provision(adminPrincipal, { ...input, ...change }), { code: "REGISTRATION_FAILED" });
      }
      assert.equal(await database.user.count(), 2);
      assert.equal(await database.barbershop.count(), 1);
      assert.equal(await database.platformAuditEvent.count({ where: { event: "platform.shop_created" } }), 1);
      await assert.rejects(accounts.provision(adminPrincipal, { ...input, slug: "business" }), { code: "INVALID_INPUT" });
    });
    await t.test("login is case insensitive, rotates the old token and logout revokes it", async () => {
      const signedIn = await accounts.login(input.email.toUpperCase(), input.password, registered.token, input.slug);
      assert.notEqual(signedIn.token, registered.token);
      assert.equal(await accounts.authenticate(registered.token), null);
      assert(await accounts.authenticate(signedIn.token));
      await accounts.logout(signedIn.token);
      assert.equal(await accounts.authenticate(signedIn.token), null);
      assert.equal(await database.staffAuthEvent.count({ where: { event: "logout.succeeded", userId: owner.id } }), 1);
      await assert.rejects(accounts.login(input.email, "wrong-password"), { code: "INVALID_CREDENTIALS" });
      await assert.rejects(accounts.login("missing@example.invalid", input.password), { code: "INVALID_CREDENTIALS" });
    });
    await t.test("expired, idle and malformed sessions cannot authenticate", async () => {
      for (const field of ["expiresAt", "lastSeenAt"] as const) {
        const session = await accounts.login(input.email, input.password, undefined, input.slug);
        await database.staffSession.update({ where: { tokenHash: digest(session.token) }, data: { [field]: new Date(Date.now() - 9 * 60 * 60_000) } });
        assert.equal(await accounts.authenticate(session.token), null);
      }
      for (const token of [undefined, "", "a".repeat(63), "z".repeat(64), "0".repeat(64)]) assert.equal(await accounts.authenticate(token), null);
    });
    await t.test("owners disable shop access without losing history or other memberships", async () => {
      const team = createStaffTeam(database);
      const principal = { userId: owner.id, memberships: [{ barbershopId: shop.id, role: "OWNER" as const }] };
      const other = await database.barbershop.create({ data: { name: "Second staff shop", slug: "second-staff-shop" } });
      const user = await database.user.create({ data: { email: "staff@example.invalid", passwordHash: owner.passwordHash } });
      const member = await database.shopMembership.create({ data: { userId: user.id, barbershopId: shop.id, role: "BARBER", manageAppointments: true, manageSchedules: true } });
      const barber = await database.barber.create({ data: { barbershopId: shop.id, membershipId: member.id, displayName: "Retained barber" } });
      const otherMember = await database.shopMembership.create({ data: { userId: user.id, barbershopId: other.id, role: "RECEPTIONIST", manageAppointments: true } });
      const token = digest(randomUUID());
      await database.staffSession.create({ data: { tokenHash: digest(token), userId: user.id, shopId: shop.id, expiresAt: new Date(Date.now() + 60_000) } });
      const stale = await accounts.authenticate(token);
      const permitted = () => withStaffAccess(database, stale, shop.id, "appointments", async () => true);
      assert.equal(await permitted(), true);
      await assert.rejects(team.access(stale, shop.id, member.id, true), /Forbidden/);
      await assert.rejects(team.access(principal, shop.id, otherMember.id, true), /Member unavailable/);
      const ownerMembership = await database.shopMembership.findUniqueOrThrow({ where: { barbershopId_userId: { barbershopId: shop.id, userId: owner.id } } });
      await assert.rejects(team.access(principal, shop.id, ownerMembership.id, true), /Member unavailable/);
      await team.access(principal, shop.id, member.id, true);
      assert.equal(await accounts.authenticate(token), null);
      const otherSession = await accounts.login(user.email, input.password, undefined, other.slug);
      assert.deepEqual((await accounts.authenticate(otherSession.token))?.memberships, [{ barbershopId: other.id, role: "RECEPTIONIST" }]);
      await assert.rejects(permitted(), /Forbidden/);
      await assert.rejects(withStaffAccess(database, stale, shop.id, "schedules", async () => true), /Forbidden/);
      await assert.rejects(withStaffAccess(database, stale, other.id, "appointments", async () => true), /Forbidden/);
      await assert.rejects(team.permissions(principal, shop.id, member.id, { manageAppointments: true, manageSchedules: true }), /Member unavailable/);
      await assert.rejects(team.access(principal, shop.id, member.id, true), /Member unavailable/);
      assert(await database.barber.findUnique({ where: { id: barber.id } }));
      const disabled = (await team.list(principal, shop.id)).members.find(item => item.id === member.id);
      assert(disabled?.accessDisabledAt);
      assert.equal(disabled.manageAppointments, false);
      assert.equal(disabled.manageSchedules, false);
      assert.equal(await database.auditEvent.count({ where: { barbershopId: shop.id, event: "team.access_disabled" } }), 1);
      await team.access(principal, shop.id, member.id, false);
      assert.equal((await accounts.authenticate(token))?.memberships.length, 1);
      await assert.rejects(permitted(), /Forbidden/);
      await team.permissions(principal, shop.id, member.id, { manageAppointments: true, manageSchedules: false });
      assert.equal(await permitted(), true);
      assert.equal(await database.auditEvent.count({ where: { barbershopId: shop.id, event: "team.access_restored" } }), 1);
      await assert.rejects(team.access(principal, shop.id, member.id, false), /Member unavailable/);
    });
    await t.test("sessions refresh roles and exclude deleted shops; cross-shop access fails", async () => {
      const session = await accounts.login(input.email, input.password, undefined, input.slug);
      const other = await database.barbershop.create({ data: { name: "Other", slug: "other" } });
      const principal = await accounts.authenticate(session.token);
      await assert.rejects(createServiceCatalog(database).list(principal, other.id), /Forbidden/);
      await database.shopMembership.updateMany({ where: { userId: owner.id }, data: { role: "BARBER" } });
      assert.equal((await accounts.authenticate(session.token))?.memberships[0]?.role, "BARBER");
      await assert.rejects(createServiceCatalog(database).list(principal, shop.id), /Forbidden/);
      await database.barbershop.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });
      assert.equal(await accounts.authenticate(session.token), null);
    });
    await t.test("concurrent attempts share the limit and expired windows reset", async () => {
      // Stub only expensive password work; exercise real SQL locking and limits.
      const fast = createStaffAccounts(database, { hashPassword, verifyAccountPassword: async () => false });
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => fast.login("limited@example.invalid", "invalid")));
      const codes = results.map(result => result.status === "rejected" ? result.reason.code : "unexpected-success");
      assert.equal(codes.filter(code => code === "INVALID_CREDENTIALS").length, 5);
      assert.equal(codes.filter(code => code === "RATE_LIMITED").length, 3);
      await database.authRateLimit.updateMany({ data: { expiresAt: new Date(0) } });
      await assert.rejects(fast.login("limited@example.invalid", "invalid"), { code: "INVALID_CREDENTIALS" });
      await database.authRateLimit.update({ where: { key: "login:global" }, data: { attempts: 100 } });
      await assert.rejects(fast.login("fresh@example.invalid", "invalid"), { code: "RATE_LIMITED" });
    });
  } finally {
    await database.$disconnect();
    await pool.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
});
