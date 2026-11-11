import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { delimiter, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));

export function parseArguments(args) {
  const local = args.includes("--local");
  const positional = args.filter(arg => arg !== "--local");
  const [operation, source, confirmation] = positional;
  if (args.filter(arg => arg === "--local").length > 1 ||
      !(operation === "backup" && positional.length === 1 ||
        operation === "verify" && positional.length === 2 && !source.startsWith("--") ||
        operation === "restore" && positional.length === 3 && !source.startsWith("--") && confirmation === "--confirm-replace")) {
    throw new Error("Usage: npm run db:backup -- [--local]\n       npm run db:verify-backup -- /path/to/backup.dump [--local]\n       npm run db:restore -- /path/to/backup.dump --confirm-replace [--local]");
  }
  return { operation, source, local };
}

// Keep credentials in the child environment, never in command arguments or logs.
export function localEnvironment(connectionString, inherited = process.env) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error("Set a valid local DATABASE_URL in root .env."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("--local requires a PostgreSQL DATABASE_URL on localhost, 127.0.0.1 or ::1.");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || !url.username) throw new Error("DATABASE_URL requires a user and database name.");
  const allowed = new Set(["schema", "sslmode"]);
  for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw new Error(`Unsupported local connection option: ${key}`);
  if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") throw new Error("Local backups currently require the public application schema.");
  // Do not let unrelated PG* shell settings redirect the target or load a service file.
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith("PG")));
  return { ...env, PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database, PGSSLMODE: url.searchParams.get("sslmode") || "prefer", PGCONNECT_TIMEOUT: "10" };
}

export function createRunner(local) {
  let env = process.env, bin = "";
  if (local) {
    env = localEnvironment(process.env.DATABASE_URL);
    const bundled = resolve(root, ".local/postgres/usr/lib/postgresql/16/bin");
    bin = process.env.BARBER_PG_BIN || (existsSync(resolve(bundled, "pg_dump")) ? bundled : "");
    if (bin === bundled) {
      const libraries = resolve(root, ".local/postgres/usr/lib/x86_64-linux-gnu");
      env.LD_LIBRARY_PATH = [libraries, env.LD_LIBRARY_PATH].filter(Boolean).join(delimiter);
    }
  }
  return async function run(program, args, { input, output, capture = false } = {}) {
    const executable = local ? (bin ? resolve(bin, program) : program) : "docker";
    const commandArgs = local ? args : ["compose", "exec", "-T", "db", "sh", "-c", 'export PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB"; exec "$@"', "sh", program, ...args];
    const child = spawn(executable, commandArgs, { cwd: root, env, stdio: [input ? "pipe" : "ignore", output || capture ? "pipe" : "inherit", "inherit"] });
    let result = "";
    if (capture) child.stdout.setEncoding("utf8").on("data", chunk => { result += chunk; });
    const finished = new Promise((resolve, reject) => {
      child.once("error", () => reject(new Error(`Cannot start ${local ? program : "Docker"}. Check the installation and BARBER_PG_BIN for local PostgreSQL tools.`)));
      child.once("close", code => code === 0 ? resolve() : reject(new Error(`${program} failed (${code})`)));
    });
    const streams = [];
    if (input) streams.push(pipeline(input, child.stdin));
    if (output) streams.push(pipeline(child.stdout, output));
    try { await Promise.all([finished, ...streams]); }
    catch (error) { child.kill(); await Promise.allSettled([finished, ...streams]); throw error; }
    return result.trim();
  };
}

export async function backup(run, directory = resolve(root, ".local/backups")) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = resolve(directory, `barber-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.dump`), partial = `${target}.partial`;
  try {
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--no-password"], { output: createWriteStream(partial, { flags: "wx", mode: 0o600 }) });
    await rename(partial, target);
  } catch (error) { await unlink(partial).catch(() => {}); throw error; }
  return target;
}

export async function restore(run, source, database) {
  if (!(await stat(source)).isFile()) throw new Error("Backup must be a file");
  await run("pg_restore", ["--clean", "--if-exists", "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", "--no-password",
    // pg_restore needs -d to restore rather than emit SQL. PGDATABASE is the default target.
    "--dbname", database ?? ""], { input: createReadStream(source) });
}

export async function verify(run, source) {
  if (!(await stat(source)).isFile()) throw new Error("Backup must be a file");
  const database = `barber_restore_check_${randomUUID().replaceAll("-", "")}`;
  // Only a successful CREATE grants this function permission to drop this name.
  await run("createdb", ["--no-password", "--template=template0", database]);
  try {
    await restore(run, source, database);
    const query = async sql => JSON.parse(await run("psql", ["--no-password", "--no-psqlrc", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", "--dbname", database, "--command", sql], { capture: true }));
    const migrations = await query(`SELECT COALESCE(json_agg(migration_name ORDER BY migration_name), '[]') FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    const expected = (await readdir(resolve(root, "packages/database/prisma/migrations"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    if (JSON.stringify(migrations) !== JSON.stringify(expected)) throw new Error("Restored migration history differs from this checkout. Use the matching application version or migrate a restored copy before use.");
    const checks = await query(`SELECT json_build_object(
      'unfinishedMigrations', (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),
      'overlapConstraint', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_no_barber_overlap' AND contype = 'x'),
      'tenantForeignKey', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_barbershop_id_barber_id_fkey' AND contype = 'f' AND convalidated),
      'shops', (SELECT count(*) FROM public.barbershops), 'appointments', (SELECT count(*) FROM public.appointments),
      'clients', (SELECT count(*) FROM public.clients), 'staffSessions', (SELECT count(*) FROM public.staff_sessions),
      'payments', (SELECT count(*) FROM public.payments), 'mediaRecords', (SELECT count(*) FROM public.media_assets))`);
    if (checks.unfinishedMigrations || !checks.overlapConstraint || !checks.tenantForeignKey) throw new Error("Restored database is missing required migration or booking protections.");
    return { migrations: migrations.length, ...checks };
  } finally {
    try { await run("dropdb", ["--no-password", database]); }
    catch { throw new Error(`Temporary restore database cleanup failed: ${database}. Remove this temporary database after inspecting the failure.`); }
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  config({ path: resolve(root, ".env") });
  const run = createRunner(options.local);
  if (options.operation === "backup") {
    console.log(`Backup saved: ${await backup(run)}`);
  } else if (options.operation === "verify") {
    const result = await verify(run, resolve(options.source));
    console.log(`Restore verified in a separate temporary database, now removed. ${JSON.stringify(result)}`);
  } else {
    console.log(`Restoring the configured ${options.local ? "local" : "Compose"} database. Existing matching objects will be replaced.`);
    await restore(run, resolve(options.source));
    console.log("Restore completed.");
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : "Database operation failed"); process.exitCode = 1; });
}
