"use server";
import { revalidatePath } from "next/cache";
import { createPlatformAdministration, getDatabase } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";

export interface AdminState { error?: MessageKey; success?: boolean; }
export async function setShopSuspension(_state: AdminState, form: FormData): Promise<AdminState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    const field = (key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
    const operation = field("operation");
    if (operation !== "suspend" && operation !== "reactivate") return { error: "adminFailed" };
    await createPlatformAdministration(getDatabase()).suspend(principal, field("shopId"), operation === "suspend", field("reason"));
    revalidatePath("/admin", "layout");
    revalidatePath("/workspace", "layout");
    return { success: true };
  } catch { return { error: "adminFailed" }; }
}
