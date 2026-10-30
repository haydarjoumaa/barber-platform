"use server";
import { revalidatePath } from "next/cache";
import { requireShopOwner } from "@barber/auth";
import { createMediaRepository, getDatabase } from "@barber/database";
import { MAX_IMAGE_BYTES } from "@barber/storage";
import type { MediaActionState } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export async function saveOwnerMedia(shopId: string, clientId: string | null, _state: MediaActionState, form: FormData): Promise<MediaActionState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(shopId) || (clientId !== null && !uuid.test(clientId))) return { error: "mediaFailed" };
    requireShopOwner(principal, shopId);
    const media = createMediaRepository(getDatabase()), operation = scheduleField(form, "operation");
    if (operation === "upload") {
      const kind = scheduleField(form, "kind"), image = form.get("image");
      if ((kind !== "SHOP_LOGO" && kind !== "PROFILE" && kind !== "HAIRCUT") || !(image instanceof File) || !image.size || image.size > MAX_IMAGE_BYTES || scheduleField(form, "consent") !== "on") return { error: "mediaInvalid" };
      await media.ownerUpload(principal, shopId, clientId, kind, { bytes: new Uint8Array(await image.arrayBuffer()), contentType: image.type }, true);
    } else if (operation === "remove") await media.ownerRemove(principal, shopId, clientId, scheduleField(form, "assetId"));
    else return { error: "mediaFailed" };
    revalidatePath("/workspace", "layout");
    return { success: true };
  } catch (error) { return { error: error instanceof Error && error.message === "Too many attempts" ? "authRateLimited" : "mediaFailed" }; }
}
