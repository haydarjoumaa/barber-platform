import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { backup, localEnvironment, parseArguments, verify } from "../scripts/database-backup.mjs";

test("restore requires explicit confirmation and rejects extra arguments", () => {
  assert.deepEqual(parseArguments(["backup", "--local"]), { operation: "backup", source: undefined, local: true });
  assert.deepEqual(parseArguments(["verify", "/tmp/test.dump"]), { operation: "verify", source: "/tmp/test.dump", local: false });
  assert.equal(parseArguments(["restore", "test.dump", "--confirm-replace", "--local"]).local, true);
  for (const args of [["restore", "test.dump"], ["restore", "test.dump", "yes"], ["backup", "extra"], ["backup", "--local", "--local"], ["verify", "--invalid"]]) assert.throws(() => parseArguments(args));
});

test("local connection is explicit, decoded, loopback-only and insulated from inherited PG settings", () => {
  const env = localEnvironment("postgresql://local:p%40ss@127.0.0.1:55440/barber?schema=public", { PATH: "/bin", PGHOSTADDR: "remote", PGSERVICE: "production", PGDATABASE: "wrong" });
  assert.equal(env.PGUSER, "local"); assert.equal(env.PGPASSWORD, "p@ss");
  assert.equal(env.PGPORT, "55440"); assert.equal(env.PGDATABASE, "barber"); assert.equal(env.PATH, "/bin");
  assert.equal(env.PGHOSTADDR, undefined); assert.equal(env.PGSERVICE, undefined);
  assert.equal(localEnvironment("postgres://user:pass@[::1]/barber").PGHOST, "::1");
  for (const url of ["invalid", "https://localhost/db", "postgres://user:pass@remote/db", "postgres://user@localhost/", "postgres://user@localhost/db?schema=other", "postgres://user@localhost/db?host=remote"]) assert.throws(() => localEnvironment(url));
});

test("backup publishes a private dump only after success and removes failed partial files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "barber-backup-test-"));
  try {
    const saved = await backup(async (_program, _args, { output }) => {
      await new Promise((resolve, reject) => { output.on("error", reject); output.end("test archive", resolve); });
    }, directory);
    assert.equal(await readFile(saved, "utf8"), "test archive");
    if (process.platform !== "win32") assert.equal((await stat(saved)).mode & 0o777, 0o600);
    await assert.rejects(backup(async (_program, _args, { output }) => {
      await new Promise(resolve => output.end("incomplete", resolve)); throw new Error("dump failed");
    }, directory), /dump failed/);
    assert.equal((await readdir(directory)).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed restore checks clean up only their successfully created temporary database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "barber-restore-test-")), source = join(directory, "test.dump");
  await writeFile(source, "test");
  try {
    const calls = [];
    await assert.rejects(verify(async (program, args, streams) => {
      calls.push({ program, args });
      if (program === "pg_restore") { streams.input.destroy(); throw new Error("invalid archive"); }
    }, source), /invalid archive/);
    assert.deepEqual(calls.map(call => call.program), ["createdb", "pg_restore", "dropdb"]);
    const database = calls[0].args.at(-1);
    assert.match(database, /^barber_restore_check_[a-f0-9]{32}$/);
    assert.equal(calls[1].args.at(-1), database); assert.equal(calls[2].args.at(-1), database);
    const failed = [];
    await assert.rejects(verify(async program => { failed.push(program); throw new Error("create denied"); }, source), /create denied/);
    assert.deepEqual(failed, ["createdb"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
