"use server";

import { revalidatePath } from "next/cache";
import { createShopProfiles, getDatabase, ShopProfileError, type ShopProfileInput } from "@barber/database";
import { isValidShopSlug, type MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface ShopProfileState { error?: MessageKey; saved?: ShopProfileInput; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function saveShopProfile(_state: ShopProfileState, form: FormData): Promise<ShopProfileState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId");
    const input = { name: scheduleField(form, "name").trim(), slug: scheduleField(form, "slug").trim() };
    const expected = { name: scheduleField(form, "expectedName"), slug: scheduleField(form, "expectedSlug") };
    if (!uuid.test(shopId) || !input.name || input.name.length > 100 || !isValidShopSlug(input.slug) ||
      !expected.name || expected.name.length > 100 || !isValidShopSlug(expected.slug)) return { error: "shopProfileInvalid" };
    const saved = await createShopProfiles(getDatabase()).update(principal, shopId, input, expected);
    revalidatePath("/workspace", "layout");
    return { saved };
  } catch (error) {
    if (error instanceof ShopProfileError) return { error: error.code === "STALE" ? "shopProfileStale" : error.code === "SLUG_TAKEN" ? "shopSlugTaken" : "shopProfileInvalid" };
    return { error: "shopProfileFailed" };
  }
}
