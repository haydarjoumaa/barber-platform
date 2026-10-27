import { createHash, randomBytes } from "node:crypto";
import { isValidShopSlug } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import type { StaffPrincipal } from "@barber/auth";

export class AccountError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "INVALID_CREDENTIALS" | "REGISTRATION_FAILED" | "RATE_LIMITED") { super(code); }
}
export const STAFF_SESSION_SECONDS = 8 * 60 * 60;
const IDLE_MS = 60 * 60_000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const validToken = (value: string) => /^[a-f0-9]{64}$/.test(value);
const emailAddress = (value: string) => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
interface Passwords { hashPassword(value: string): Promise<string>; verifyAccountPassword(value: string, encoded: string | null): Promise<boolean>; }
export interface OwnerRegistration { email: string; password: string; shopName: string; slug: string; currency: string; }

/** Server orchestration supplies the existing password primitives. No raw session token is persisted. */
export function createStaffAccounts(database: PrismaClient, passwords: Passwords) {
  async function throttle(kind: "login" | "register", email: string) {
    const allowed = await database.$transaction(async tx => {
      await tx.authRateLimit.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      let allowed = true;
      for (const [key, limit] of [[`${kind}:global`, kind === "register" ? 20 : 100], [`${kind}:${digest(email)}`, 5]] as const) {
        const [row] = await tx.$queryRaw<{ attempts: number }[]>`
          INSERT INTO auth_rate_limits (key, attempts, expires_at) VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
          ON CONFLICT (key) DO UPDATE SET attempts = LEAST(auth_rate_limits.attempts + 1, 100001)
          RETURNING attempts`;
        if (row!.attempts > limit) allowed = false;
      }
      return allowed;
    });
    if (!allowed) throw new AccountError("RATE_LIMITED");
  }
  async function session(tx: Prisma.TransactionClient, userId: string, previousToken?: string) {
    if (previousToken && validToken(previousToken)) await tx.staffSession.deleteMany({ where: { tokenHash: digest(previousToken) } });
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + STAFF_SESSION_SECONDS * 1000);
    await tx.staffSession.create({ data: { tokenHash: digest(token), userId, expiresAt } });
    return { token, expiresAt };
  }
  return {
    async register(input: OwnerRegistration, previousToken?: string) {
      const email = emailAddress(input.email);
      await throttle("register", email ?? "invalid");
      if (!email || typeof input.password !== "string" || [...input.password].length < 12 || Buffer.byteLength(input.password, "utf8") > 1024 ||
        typeof input.shopName !== "string" || !input.shopName.trim() || input.shopName.length > 100 ||
        typeof input.slug !== "string" || !isValidShopSlug(input.slug) || !Intl.supportedValuesOf("currency").includes(input.currency)) throw new AccountError("INVALID_INPUT");
      const passwordHash = await passwords.hashPassword(input.password);
      try {
        return await database.$transaction(async tx => {
          const user = await tx.user.create({ data: { email, passwordHash } });
          const shop = await tx.barbershop.create({ data: { name: input.shopName.trim(), slug: input.slug, currency: input.currency } });
          await tx.shopMembership.create({ data: { userId: user.id, barbershopId: shop.id, role: "OWNER" } });
          await tx.auditEvent.create({ data: { barbershopId: shop.id, actorUserId: user.id, event: "owner.registered", details: {} } });
          await tx.staffAuthEvent.create({ data: { userId: user.id, event: "registration.succeeded" } });
          return session(tx, user.id, previousToken);
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AccountError("REGISTRATION_FAILED");
        throw error;
      }
    },
    async login(emailInput: string, password: string, previousToken?: string) {
      const email = emailAddress(emailInput);
      await throttle("login", email ?? "invalid");
      const user = email ? await database.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }) : null;
      const matches = await passwords.verifyAccountPassword(password, user?.passwordHash ?? null);
      if (!user || !matches) {
        await database.staffAuthEvent.create({ data: { event: "login.failed" } });
        throw new AccountError("INVALID_CREDENTIALS");
      }
      return database.$transaction(async tx => {
        // Serialize against password changes; never issue a session from a stale hash.
        const [current] = await tx.$queryRaw<{ password_hash: string | null }[]>`SELECT password_hash FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
        if (current?.password_hash !== user.passwordHash) throw new AccountError("INVALID_CREDENTIALS");
        await tx.staffAuthEvent.create({ data: { userId: user.id, event: "login.succeeded" } });
        return session(tx, user.id, previousToken);
      });
    },
    async authenticate(token: string | undefined): Promise<StaffPrincipal | null> {
      if (!token || !validToken(token)) return null;
      return database.$transaction(async tx => {
        const now = new Date();
        const active = await tx.staffSession.updateMany({ where: { tokenHash: digest(token), expiresAt: { gt: now }, lastSeenAt: { gt: new Date(now.getTime() - IDLE_MS) } }, data: { lastSeenAt: now } });
        if (!active.count) return null;
        const stored = await tx.staffSession.findUniqueOrThrow({ where: { tokenHash: digest(token) }, select: { userId: true, user: { select: { memberships: { where: { barbershop: { deletedAt: null } }, select: { barbershopId: true, role: true } } } } } });
        return { userId: stored.userId, memberships: stored.user.memberships };
      });
    },
    async logout(token: string | undefined) {
      if (!token || !validToken(token)) return;
      await database.$transaction(async tx => {
        const stored = await tx.staffSession.findUnique({ where: { tokenHash: digest(token) } });
        await tx.staffSession.deleteMany({ where: { tokenHash: digest(token) } });
        if (stored) await tx.staffAuthEvent.create({ data: { userId: stored.userId, event: "logout.succeeded" } });
      });
    },
  };
}
