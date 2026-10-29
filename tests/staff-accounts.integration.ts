import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { createStaffAccounts } from "../packages/database/src/staff-accounts";
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
    const registered = await accounts.register({ ...input, email: " Owner@Example.Invalid " });
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
      assert.equal(await database.auditEvent.count({ where: { event: "owner.registered", actorUserId: owner.id, barbershopId: shop.id } }), 1);
    });
    await t.test("duplicate identities/slugs roll back every registration write", async () => {
      for (const change of [{ email: input.email.toUpperCase(), slug: "another-shop" }, { email: "other@example.invalid" }]) {
        await assert.rejects(accounts.register({ ...input, ...change }), { code: "REGISTRATION_FAILED" });
      }
      assert.equal(await database.user.count(), 1);
      assert.equal(await database.barbershop.count(), 1);
      assert.equal(await database.staffAuthEvent.count({ where: { event: "registration.succeeded" } }), 1);
      await assert.rejects(accounts.register({ ...input, slug: "business" }), { code: "INVALID_INPUT" });
    });
    await t.test("login is case insensitive, rotates the old token and logout revokes it", async () => {
      const signedIn = await accounts.login(input.email.toUpperCase(), input.password, registered.token);
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
        const session = await accounts.login(input.email, input.password);
        await database.staffSession.update({ where: { tokenHash: digest(session.token) }, data: { [field]: new Date(Date.now() - 9 * 60 * 60_000) } });
        assert.equal(await accounts.authenticate(session.token), null);
      }
      for (const token of [undefined, "", "a".repeat(63), "z".repeat(64), "0".repeat(64)]) assert.equal(await accounts.authenticate(token), null);
    });
    await t.test("sessions refresh roles and exclude deleted shops; cross-shop access fails", async () => {
      const session = await accounts.login(input.email, input.password);
      const other = await database.barbershop.create({ data: { name: "Other", slug: "other" } });
      const principal = await accounts.authenticate(session.token);
      await assert.rejects(createServiceCatalog(database).list(principal, other.id), /Forbidden/);
      await database.shopMembership.updateMany({ where: { userId: owner.id }, data: { role: "BARBER" } });
      assert.equal((await accounts.authenticate(session.token))?.memberships[0]?.role, "BARBER");
      await assert.rejects(createServiceCatalog(database).list(principal, shop.id), /Forbidden/);
      await database.barbershop.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });
      assert.deepEqual((await accounts.authenticate(session.token))?.memberships, []);
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
