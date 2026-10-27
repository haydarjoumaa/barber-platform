"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountError } from "@barber/database";
import { PasswordCapacityError } from "@barber/auth/password";
import type { MessageKey } from "@barber/shared";
import { accountConfig, accounts, requireAccountOrigin, setStaffCookie, staffToken } from "./account-server";

export interface AccountFormState { error?: MessageKey; }
const value = (form: FormData, key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
function failure(error: unknown): AccountFormState {
  if (error instanceof PasswordCapacityError) return { error: "authBusy" };
  if (error instanceof AccountError) return { error: ({ INVALID_INPUT: "authInvalidInput", INVALID_CREDENTIALS: "authInvalidCredentials", REGISTRATION_FAILED: "authRegistrationFailed", RATE_LIMITED: "authRateLimited" } as const)[error.code] };
  return { error: "authUnavailable" };
}
export async function registerOwner(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  try {
    await requireAccountOrigin();
    const session = await accounts().register({ email: value(form, "email"), password: value(form, "password"), shopName: value(form, "shopName"), slug: value(form, "slug"), currency: value(form, "currency") }, await staffToken());
    await setStaffCookie(session);
  } catch (error) { return failure(error); }
  redirect("/workspace");
}
export async function signIn(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  try {
    await requireAccountOrigin();
    const session = await accounts().login(value(form, "email"), value(form, "password"), await staffToken());
    await setStaffCookie(session);
  } catch (error) { return failure(error); }
  redirect("/workspace");
}
export async function signOut() {
  await requireAccountOrigin();
  await accounts().logout(await staffToken());
  (await cookies()).delete(accountConfig().cookieName);
  redirect("/login");
}
