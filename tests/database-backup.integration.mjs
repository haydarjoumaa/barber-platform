import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { config } from "dotenv";
import { backup, createRunner, restore } from "../scripts/database-backup.mjs";

config();
// This test never restores over the configured database. It owns a fresh database.
test("native backup and default-target restore round trip in an isolated database", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const control = createRunner(true);
  const database = `barber_backup_test_${randomUUID().replaceAll("-", "")}`;
  const directory = await mkdtemp(join(tmpdir(), "barber-backup-integration-"));
  let created = false;
  try {
    await control("createdb", ["--no-password", "--template=template0", database]);
    created = true;
    const url = new URL(originalUrl); url.pathname = `/${database}`;
    process.env.DATABASE_URL = url.toString();
    const run = createRunner(true);
    const query = sql => run("psql", ["--no-password", "--no-psqlrc", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", "--command", sql], { capture: true });
    await query("CREATE TABLE restore_probe (id int PRIMARY KEY, value text NOT NULL); INSERT INTO restore_probe VALUES (1, 'saved')");
    const archive = await backup(run, directory);
    await query("UPDATE restore_probe SET value = 'changed'");
    await restore(run, archive);
    assert.equal(await query("SELECT value FROM restore_probe WHERE id = 1"), "saved");
  } finally {
    process.env.DATABASE_URL = originalUrl;
    try { if (created) await control("dropdb", ["--no-password", database]); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});
