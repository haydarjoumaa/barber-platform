import "server-only";
import { cookies, headers } from "next/headers";
import { createStaffAccounts, getDatabase } from "@barber/database";
import { hashPassword, verifyAccountPassword } from "@barber/auth/password";
import { assertAccountOrigin, staffAccountConfig } from "./account-policy";

export function accounts() { return createStaffAccounts(getDatabase(), { hashPassword, verifyAccountPassword }); }
export function accountConfig() {
  return staffAccountConfig(process.env.APP_ORIGIN);
}
export async function requireAccountOrigin() {
  assertAccountOrigin((await headers()).get("origin"), accountConfig().origin);
}
export async function staffToken() { return (await cookies()).get(accountConfig().cookieName)?.value; }
export async function setStaffCookie(session: { token: string; expiresAt: Date }) {
  const config = accountConfig();
  (await cookies()).set(config.cookieName, session.token, { httpOnly: true, secure: config.secure, sameSite: "lax", path: "/", expires: session.expiresAt });
}
