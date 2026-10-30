import { createHash } from "node:crypto";
import { isValidShopSlug } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

export const clientTokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const validClientToken = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export interface PublishedShop { id: string; name: string; slug: string; currency: string | null; time_zone: string; }

export async function withPublishedShop<T>(db: PrismaClient, slug: string, operation: (tx: Prisma.TransactionClient, shop: PublishedShop) => Promise<T>): Promise<T> {
  if (!isValidShopSlug(slug)) throw new Error("Shop unavailable");
  return db.$transaction(async tx => {
    const [shop] = await tx.$queryRaw<PublishedShop[]>`SELECT id, name, slug, currency, time_zone FROM barbershops WHERE slug = ${slug} AND published_at IS NOT NULL AND deleted_at IS NULL AND suspended_at IS NULL FOR UPDATE`;
    if (!shop) throw new Error("Shop unavailable");
    return operation(tx, shop);
  });
}

export async function clientIdentity(tx: Prisma.TransactionClient, shopId: string, token: string | undefined) {
  if (!validClientToken(token)) return null;
  const now = new Date();
  const active = await tx.clientSession.updateMany({ where: { tokenHash: clientTokenHash(token), barbershopId: shopId, expiresAt: { gt: now }, lastSeenAt: { gt: new Date(now.getTime() - 60 * 60_000) } }, data: { lastSeenAt: now } });
  if (!active.count) return null;
  const session = await tx.clientSession.findUniqueOrThrow({ where: { tokenHash: clientTokenHash(token) }, select: { client: { select: { id: true, name: true, phone: true, email: true, birthday: true } } } });
  return session.client;
}

export async function throttleClient(db: PrismaClient, shopId: string, kind: string, identity: string, limit = 10) {
  const allowed = await db.$transaction(async tx => {
    let allowed = true;
    for (const [key, maximum] of [[`client:${kind}:shop:${shopId}`, 150], [`client:${kind}:${clientTokenHash(`${shopId}:${identity}`)}`, limit]] as const) {
      const [row] = await tx.$queryRaw<{ attempts: number }[]>`
        INSERT INTO auth_rate_limits (key, attempts, expires_at) VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
        ON CONFLICT (key) DO UPDATE SET attempts = CASE WHEN auth_rate_limits.expires_at <= NOW() THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, 100001) END,
        expires_at = CASE WHEN auth_rate_limits.expires_at <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE auth_rate_limits.expires_at END RETURNING attempts`;
      if (row!.attempts > maximum) allowed = false;
    }
    return allowed;
  });
  if (!allowed) throw new Error("Too many attempts");
}
