import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parse } from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error("Node.js 22.12 or newer is required. With nvm: nvm install 22 && nvm use 22");
  process.exit(1);
}
const envPath = resolve(root, ".env");
if (!existsSync(envPath)) {
  const password = randomBytes(24).toString("hex");
  writeFileSync(envPath, `POSTGRES_USER=barber\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=barber\nDATABASE_URL=postgresql://barber:${password}@127.0.0.1:5432/barber?schema=public\n`, { flag: "wx", mode: 0o600 });
  console.log("Created private local database configuration.");
}
const env = parse(readFileSync(envPath));
if (!env.DATABASE_URL) throw new Error("Set DATABASE_URL in the root .env before running setup.");
for (const [app, port] of [["business", 3001], ["client", 3002]]) {
  const path = resolve(root, "apps", app, ".env.local");
  if (existsSync(path)) {
    const current = parse(readFileSync(path));
    if (current.DATABASE_URL !== env.DATABASE_URL) {
      console.error(`apps/${app}/.env.local uses a different database. Align it with root .env; existing values were preserved.`);
      process.exitCode = 1;
    }
    continue;
  }
  const config = `DATABASE_URL=${JSON.stringify(env.DATABASE_URL)}\nAPP_ORIGIN=http://localhost:${port}\n${app === "business" ? "CLIENT_ORIGIN=http://localhost:3002\n" : ""}${env.BARBER_UPLOAD_ROOT ? `BARBER_UPLOAD_ROOT=${JSON.stringify(env.BARBER_UPLOAD_ROOT)}\n` : ""}`;
  writeFileSync(path, config, { flag: "wx", mode: 0o600 });
  console.log(`Created apps/${app}/.env.local.`);
}
console.log("Existing configuration and data have been preserved.");
console.log("Start PostgreSQL, then run: npm run db:generate && npm run db:deploy && npm run dev");
console.log("Business: http://localhost:3001   Client: http://localhost:3002/<shop-slug>");
