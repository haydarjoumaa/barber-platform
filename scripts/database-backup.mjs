import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [operation, argument, confirmation] = process.argv.slice(2);
function docker(command, input, output) {
  const child = spawn("docker", ["compose", "exec", "-T", "db", "sh", "-c", command], { cwd: root, stdio: [input ? "pipe" : "ignore", output ? "pipe" : "inherit", "inherit"] });
  const finished = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(`Database command failed (${code})`)));
  });
  const streams = [];
  if (input) streams.push(pipeline(input, child.stdin));
  if (output) streams.push(pipeline(child.stdout, output));
  return Promise.all([finished, ...streams]).catch(error => { child.kill(); throw error; });
}

try {
  if (operation === "backup") {
    const directory = resolve(root, ".local/backups");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const name = `barber-${new Date().toISOString().replaceAll(":", "-")}.dump`;
    const target = resolve(directory, name), partial = `${target}.partial`;
    await docker('exec pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"', null, createWriteStream(partial, { flags: "wx", mode: 0o600 }));
    await rename(partial, target);
    console.log(`Backup saved: ${target}`);
  } else if (operation === "restore" && argument && confirmation === "--confirm-replace") {
    const source = resolve(argument);
    if (!(await stat(source)).isFile()) throw new Error("Backup must be a file");
    console.log("Restoring the configured local Compose database. Existing matching objects will be replaced.");
    await docker('exec pg_restore --clean --if-exists --exit-on-error --single-transaction --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"', createReadStream(source), null);
    console.log("Restore completed.");
  } else {
    console.error("Usage: node scripts/database-backup.mjs backup\n       node scripts/database-backup.mjs restore /path/to/backup.dump --confirm-replace\nRestore replaces data in the local Compose database. Stop application traffic first.");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database operation failed");
  process.exitCode = 1;
}
