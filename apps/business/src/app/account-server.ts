import "server-only";
import { cookies, headers } from "next/headers";
import { createStaffAccounts, getDatabase } from "@barber/database";
import { hashPassword, verifyAccountPassword } from "@barber/auth/password";

export function accounts() { return createStaffAccounts(getDatabase(), { hashPassword, verifyAccountPassword }); }
export function accountConfig() {
  if (!process.env.APP_ORIGIN) throw new Error("APP_ORIGIN is required");
  const origin = new URL(process.env.APP_ORIGIN);
  if (origin.origin !== process.env.APP_ORIGIN || !["http:", "https:"].includes(origin.protocol) ||
    (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) throw new Error("Invalid APP_ORIGIN");
  const secure = origin.protocol === "https:";
  return { origin: origin.origin, secure, cookieName: secure ? "__Host-barber-staff" : "barber-staff-local" };
}
export async function requireAccountOrigin() {
  if ((await headers()).get("origin") !== accountConfig().origin) throw new Error("Invalid request origin");
}
export async function staffToken() { return (await cookies()).get(accountConfig().cookieName)?.value; }
export async function setStaffCookie(session: { token: string; expiresAt: Date }) {
  const config = accountConfig();
  (await cookies()).set(config.cookieName, session.token, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", expires: session.expiresAt });
}
