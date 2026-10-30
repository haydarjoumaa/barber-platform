"use server";
import { revalidatePath } from "next/cache";
import { createShopDetails, getDatabase } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface ShopDetailsState { error?: MessageKey; updatedAt?: string; }
export async function saveShopDetails(_state: ShopDetailsState, form: FormData): Promise<ShopDetailsState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId");
    if (!/^[0-9a-f-]{36}$/i.test(shopId)) return { error: "shopDetailsFailed" };
    const saved = await createShopDetails(getDatabase()).update(principal, shopId, { phone: scheduleField(form, "phone"), address: scheduleField(form, "address"), description: scheduleField(form, "description"), brandColor: scheduleField(form, "brandColor") }, scheduleField(form, "expectedUpdatedAt"));
    revalidatePath("/workspace", "layout");
    return { updatedAt: saved.updatedAt };
  } catch (error) { return { error: error instanceof Error && error.message === "Profile changed" ? "shopProfileStale" : "shopDetailsFailed" }; }
}
