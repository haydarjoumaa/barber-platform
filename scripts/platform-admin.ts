import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../packages/database/src/generated/prisma/client";

const [operation, email] = process.argv.slice(2);
if (operation !== "grant" || !email || !process.env.DATABASE_URL) throw new Error("Usage: npm run admin:grant -- staff-email@example.com (requires DATABASE_URL)");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  await db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, passwordHash: true } });
    if (!user?.passwordHash) throw new Error("Register a staff identity with a password first");
    await tx.platformAdmin.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    await tx.platformAuditEvent.create({ data: { id: randomUUID(), actorUserId: user.id, event: "platform.admin_bootstrapped", details: { source: "local_operator_cli" } } });
  });
  console.log("Platform administrator access granted to the selected staff identity.");
} finally { await db.$disconnect(); }
