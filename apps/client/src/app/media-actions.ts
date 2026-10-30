"use server";
import { revalidatePath } from "next/cache";
import { createMediaRepository, getDatabase } from "@barber/database";
import { MAX_IMAGE_BYTES } from "@barber/storage";
import type { MediaActionState } from "@barber/shared";
import { clientAccounts, clientShop, clientToken, requireClientOrigin } from "./client-server";

export async function saveClientMedia(slug: string, _state: MediaActionState, form: FormData): Promise<MediaActionState> {
  try {
    await requireClientOrigin();
    const shop = await clientShop(slug);
    if (!shop) return { error: "mediaFailed" };
    const token = await clientToken(shop.id);
    if (!await clientAccounts().authenticate(slug, token)) return { error: "serviceSignIn" };
    const media = createMediaRepository(getDatabase());
    const field = (key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
    if (field("operation") === "upload") {
      const kind = field("kind"), image = form.get("image");
      if ((kind !== "PROFILE" && kind !== "HAIRCUT") || !(image instanceof File) || !image.size || image.size > MAX_IMAGE_BYTES || field("consent") !== "on") return { error: "mediaInvalid" };
      await media.clientUpload(slug, token, kind, { bytes: new Uint8Array(await image.arrayBuffer()), contentType: image.type }, true);
    } else if (field("operation") === "remove") await media.clientRemove(slug, token, field("assetId"));
    else return { error: "mediaFailed" };
    revalidatePath(`/${slug}/account`);
    return { success: true };
  } catch (error) { return { error: error instanceof Error && error.message === "Too many attempts" ? "authRateLimited" : "mediaFailed" }; }
}
