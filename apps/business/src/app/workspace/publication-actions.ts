"use server";
import { revalidatePath } from "next/cache";
import { createShopPublication, getDatabase, PublicationIncompleteError } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface PublicationState { error?: MessageKey; published?: boolean; }
export async function savePublication(_state: PublicationState, form: FormData): Promise<PublicationState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), operation = scheduleField(form, "operation");
    if (!/^[0-9a-f-]{36}$/i.test(shopId) || !["publish", "unpublish"].includes(operation) || form.get("confirm") !== "on") return { error: "publishFailed" };
    const publication = createShopPublication(getDatabase());
    const saved = operation === "publish" ? await publication.publish(principal, shopId) : await publication.unpublish(principal, shopId);
    revalidatePath("/workspace", "layout");
    return { published: Boolean(saved.publishedAt) };
  } catch (error) { return { error: error instanceof PublicationIncompleteError ? "publishIncomplete" : "publishFailed" }; }
}
