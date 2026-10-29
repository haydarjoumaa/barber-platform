"use server";

import { revalidatePath } from "next/cache";
import { createServiceCatalog, getDatabase } from "@barber/database";
import { parsePriceMinor, type MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";

export interface ServiceFormState { error?: MessageKey; success?: boolean; }
const field = (form: FormData, key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveService(_state: ServiceFormState, form: FormData): Promise<ServiceFormState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = field(form, "shopId");
    const serviceId = field(form, "serviceId");
    const operation = field(form, "operation");
    if (!uuid.test(shopId) || !["create", "update", "archive", "currency"].includes(operation) ||
      (["update", "archive"].includes(operation) && !uuid.test(serviceId))) return { error: "serviceInvalid" };
    const catalog = createServiceCatalog(getDatabase());
    if (operation === "currency") {
      await catalog.setCurrency(principal, shopId, field(form, "currency"));
    } else if (operation === "archive") {
      await catalog.archiveService(principal, shopId, serviceId);
    } else {
      // Load currency through the owner-authorized repository, never a hidden form value.
      const current = await catalog.list(principal, shopId);
      if (!current.currency) return { error: "serviceCurrencyRequired" };
      if (field(form, "displayedCurrency") !== current.currency) return { error: "serviceFailed" };
      let input;
      try {
        const duration = field(form, "duration");
        const name = field(form, "name").trim();
        if (!name || name.length > 100 || !/^\d{1,10}$/.test(duration)) throw new Error("Invalid input");
        const durationMinutes = Number(duration);
        if (durationMinutes < 1 || durationMinutes > 2_147_483_647) throw new Error("Invalid duration");
        input = { name, durationMinutes, priceMinor: parsePriceMinor(field(form, "price"), current.currency) };
      } catch { return { error: "serviceInvalid" }; }
      if (operation === "create") await catalog.createService(principal, shopId, input, current.currency);
      else await catalog.updateService(principal, shopId, serviceId, input);
    }
    revalidatePath("/workspace");
    return { success: true };
  } catch {
    // Do not expose database details or disclose records belonging to other shops.
    return { error: "serviceFailed" };
  }
}
