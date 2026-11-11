import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";
import { hashPassword } from "../packages/auth/src/password-core";

const [operation, emailInput] = process.argv.slice(2);
const email = emailInput?.trim().toLowerCase();
if ((operation !== "grant" && operation !== "create") || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !process.env.DATABASE_URL) {
  throw new Error("Usage: npm run admin:create -- email@example.com OR npm run admin:grant -- existing-email@example.com (requires DATABASE_URL)");
}
async function newPassword() {
  if (!process.stdin.isTTY) throw new Error("Run admin:create in an interactive terminal; passwords are not accepted in command arguments.");
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write("New administrator password (at least 12 characters, hidden): ");
    muted = true;
    const password = await input.question("");
    process.stdout.write("\nConfirm password (hidden): ");
    const confirmation = await input.question("");
    process.stdout.write("\n");
    if (password !== confirmation || [...password].length < 12 || Buffer.byteLength(password, "utf8") > 1024) throw new Error("Passwords must match and contain at least 12 characters (maximum 1024 bytes).");
    return hashPassword(password);
  } finally { input.close(); }
}
const passwordHash = operation === "create" ? await newPassword() : null;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  await db.$transaction(async tx => {
    const user = operation === "create"
      ? await tx.user.create({ data: { email, passwordHash } })
      : await tx.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
    if (!user?.passwordHash) throw new Error("No existing password account found. Use admin:create for a new administrator.");
    await tx.platformAdmin.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    await tx.platformAuditEvent.create({ data: { id: randomUUID(), actorUserId: user.id, event: "platform.admin_bootstrapped", details: { source: "local_operator_cli", operation } } });
  });
  console.log("Platform administrator configured. Sign in at http://localhost:3001/login.");
} finally { await db.$disconnect(); }
