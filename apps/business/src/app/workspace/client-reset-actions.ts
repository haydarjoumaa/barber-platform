"use server";
import { createClientAccounts, getDatabase } from "@barber/database";
import { hashPassword, verifyAccountPassword } from "@barber/auth/password";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface ResetCodeState { error?: MessageKey; code?: string; expiresAt?: string; }
export async function issueClientReset(_state: ResetCodeState, form: FormData): Promise<ResetCodeState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), clientId = scheduleField(form, "clientId");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(shopId) || !uuid.test(clientId) || scheduleField(form, "identityVerified") !== "on") return { error: "clientRecoveryFailed" };
    return await createClientAccounts(getDatabase(), { hashPassword, verifyAccountPassword }).issueReset(principal, shopId, clientId, true);
  } catch { return { error: "clientRecoveryFailed" }; }
}
