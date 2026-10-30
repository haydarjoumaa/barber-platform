import "server-only";
import { cookies, headers } from "next/headers";
import { createClientAccounts, getDatabase } from "@barber/database";
import { hashPassword, verifyAccountPassword } from "@barber/auth/password";
import { isValidShopSlug } from "@barber/shared";

export function clientAccounts() { return createClientAccounts(getDatabase(), { hashPassword, verifyAccountPassword }); }
export function clientConfig() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error("APP_ORIGIN required for client accounts");
  const url = new URL(value);
  if (url.origin !== value || !["https:", "http:"].includes(url.protocol) || (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Invalid APP_ORIGIN");
  return { origin: url.origin, secure: url.protocol === "https:" };
}
export function clientCookieName(shopId: string) { return `${clientConfig().secure ? "__Host-" : ""}barber-client-${shopId}`; }
export async function requireClientOrigin() { if ((await headers()).get("origin") !== clientConfig().origin) throw new Error("Invalid origin"); }
export async function clientToken(shopId: string) { return (await cookies()).get(clientCookieName(shopId))?.value; }
export async function setClientCookie(session: { shopId: string; token: string; expiresAt: Date }) {
  (await cookies()).set(clientCookieName(session.shopId), session.token, { httpOnly: true, sameSite: "lax", secure: clientConfig().secure, path: "/", expires: session.expiresAt });
}
export async function clientShop(slug: string) {
  if (!isValidShopSlug(slug)) return null;
  return getDatabase().barbershop.findFirst({ where: { slug, publishedAt: { not: null }, deletedAt: null, suspendedAt: null }, select: { id: true, name: true, slug: true, timeZone: true, phone: true, address: true, description: true, brandColor: true, mediaAssets: { where: { kind: "SHOP_LOGO", removedAt: null }, take: 1, select: { id: true } } } });
}
