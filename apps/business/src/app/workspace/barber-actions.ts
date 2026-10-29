"use server";

import { revalidatePath } from "next/cache";
import { createServiceCatalog, getDatabase } from "@barber/database";
import { parsePriceMinor, type MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";

export interface BarberFormState { error?: MessageKey; success?: boolean; }
const field = (form: FormData, key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveBarber(_state: BarberFormState, form: FormData): Promise<BarberFormState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = field(form, "shopId");
    const barberId = field(form, "barberId");
    const operation = field(form, "operation");
    if (!uuid.test(shopId) || !["create", "rename", "assign", "remove"].includes(operation) ||
      (operation !== "create" && !uuid.test(barberId))) return { error: "barberInvalid" };
    const catalog = createServiceCatalog(getDatabase());
    if (operation === "create" || operation === "rename") {
      const name = field(form, "displayName").trim();
      if (!name || name.length > 100) return { error: "barberInvalid" };
      if (operation === "create") {
        const membershipId = field(form, "membershipId");
        if (!uuid.test(membershipId)) return { error: "barberInvalid" };
        await catalog.createBarber(principal, shopId, membershipId, name);
      } else await catalog.renameBarber(principal, shopId, barberId, name);
    } else {
      const serviceId = field(form, "serviceId");
      if (!uuid.test(serviceId)) return { error: "barberInvalid" };
      if (operation === "remove") await catalog.removeBarberService(principal, shopId, barberId, serviceId);
      else {
        const current = await catalog.list(principal, shopId);
        if (!current.currency || current.currency !== field(form, "displayedCurrency")) return { error: "barberFailed" };
        let input;
        try {
          const duration = field(form, "duration").trim();
          if (duration && (!/^\d{1,10}$/.test(duration) || Number(duration) < 1 || Number(duration) > 2_147_483_647)) throw new Error("Invalid duration");
          const price = field(form, "price").trim();
          input = { durationMinutes: duration ? Number(duration) : null, priceMinor: price ? parsePriceMinor(price, current.currency) : null };
        } catch { return { error: "barberInvalid" }; }
        await catalog.setBarberService(principal, shopId, barberId, serviceId, input);
      }
    }
    revalidatePath("/workspace");
    return { success: true };
  } catch { return { error: "barberFailed" }; }
}
