"use server";
import { revalidatePath } from "next/cache";
import { createShopPayments, getDatabase } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface PaymentState { success?: boolean; error?: MessageKey; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function savePayment(_state: PaymentState, form: FormData): Promise<PaymentState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), operation = scheduleField(form, "operation"), id = scheduleField(form, "id");
    if (!uuid.test(shopId) || !uuid.test(id)) return { error: "paymentFailed" };
    const payments = createShopPayments(getDatabase());
    if (operation === "record") await payments.record(principal, shopId, id);
    else if (operation === "void") await payments.void(principal, shopId, id, scheduleField(form, "reason"));
    else return { error: "paymentFailed" };
    revalidatePath("/workspace", "layout");
    return { success: true };
  } catch { return { error: "paymentFailed" }; }
}
