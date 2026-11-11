"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountError, getDatabase } from "@barber/database";
import { PasswordCapacityError } from "@barber/auth/password";
import type { MessageKey } from "@barber/shared";
import { accountConfig, accounts, requireAccountOrigin, setStaffCookie, staffToken } from "./account-server";

export interface AccountFormState { error?: MessageKey; createdSlug?: string; }
const value = (form: FormData, key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
function failure(error: unknown): AccountFormState {
  if (error instanceof PasswordCapacityError) return { error: "authBusy" };
  if (error instanceof AccountError) return { error: ({ INVALID_INPUT: "authInvalidInput", INVALID_CREDENTIALS: "authInvalidCredentials", REGISTRATION_FAILED: "authRegistrationFailed", RATE_LIMITED: "authRateLimited" } as const)[error.code] };
  return { error: "authUnavailable" };
}
export async function provisionOwner(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    const created = await accounts().provision(principal, { email: value(form, "email"), password: value(form, "password"), shopName: value(form, "shopName"), slug: value(form, "slug"), currency: value(form, "currency") });
    revalidatePath("/admin");
    return { createdSlug: created.slug };
  } catch (error) { return failure(error); }
}
export async function signIn(shopSlug: string | undefined, _state: AccountFormState, form: FormData): Promise<AccountFormState> {
  try {
    await requireAccountOrigin();
    const session = await accounts().login(value(form, "email"), value(form, "password"), await staffToken(), shopSlug);
    await setStaffCookie(session);
  } catch (error) { return failure(error); }
  redirect(shopSlug ? "/workspace" : "/admin");
}
export async function signOut() {
  await requireAccountOrigin();
  const principal = await accounts().authenticate(await staffToken());
  const shop = principal?.memberships[0] ? await getDatabase().barbershop.findUnique({ where: { id: principal.memberships[0].barbershopId }, select: { slug: true } }) : null;
  await accounts().logout(await staffToken());
  (await cookies()).delete(accountConfig().cookieName);
  redirect(shop ? `/${shop.slug}/login` : "/login");
}
