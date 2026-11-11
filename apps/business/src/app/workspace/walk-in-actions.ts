"use server";
import { revalidatePath } from "next/cache";
import { ClientPhoneExistsError, createWalkIns, getDatabase, SlotUnavailableError, WalkInQueueDisabledError, type BookingIdentityInput } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface WalkInState {
  error?: MessageKey; done?: MessageKey;
  confirmation?: { clientName?: string; barberName: string; startsAt: string; services: string[]; totalPriceMinor: number; currency: string; timeZone: string };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const phonePattern = /^\+[1-9]\d{7,14}$/;

/** Identity from the shared booking form fields; queue entries allow only existing clients and guests. */
function identity(form: FormData, allowNew: boolean): BookingIdentityInput | null {
  const mode = scheduleField(form, "identityMode") || "existing";
  if (mode === "existing") { const clientId = scheduleField(form, "clientId"); return uuid.test(clientId) ? { clientId } : null; }
  const name = scheduleField(form, "contactName").trim(), phone = scheduleField(form, "contactPhone").trim();
  if (!name || name.length > 100 || (phone && !phonePattern.test(phone))) return null;
  if (mode === "guest") return { guest: { name, phone } };
  return mode === "new" && allowNew && phone ? { newClient: { name, phone } } : null;
}

export async function walkInAction(_state: WalkInState, form: FormData): Promise<WalkInState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), operation = scheduleField(form, "operation"), barberId = scheduleField(form, "barberId");
    if (!uuid.test(shopId) || (barberId && !uuid.test(barberId))) return { error: "walkInFailed" };
    const walkIns = createWalkIns(getDatabase());
    const serviceIds = form.getAll("serviceId").filter((id): id is string => typeof id === "string");
    let result: Awaited<ReturnType<typeof walkIns.serve>> & { clientName?: string } | undefined, done: MessageKey | undefined;
    if (operation === "toggle") { await walkIns.setQueueEnabled(principal, shopId, scheduleField(form, "enabled") === "true"); done = "walkInQueueSaved"; }
    else if (operation === "remove") { await walkIns.remove(principal, shopId, scheduleField(form, "entryId")); done = "walkInQueueRemoved"; }
    else if (operation === "serve") result = await walkIns.serve(principal, shopId, scheduleField(form, "entryId"), barberId || undefined);
    else if (operation === "walk-in" || operation === "enqueue") {
      const who = identity(form, operation === "walk-in");
      if (!who || !serviceIds.length) return { error: "bookingContactInvalid" };
      if (operation === "walk-in") result = await walkIns.create(principal, shopId, { ...who, serviceIds, ...(barberId ? { barberId } : {}) });
      else {
        if (who.newClient) return { error: "walkInFailed" };
        await walkIns.enqueue(principal, shopId, { ...(who.clientId ? { clientId: who.clientId } : { guest: who.guest! }), serviceIds, ...(barberId ? { preferredBarberId: barberId } : {}) });
        done = "walkInQueueAdded";
      }
    } else return { error: "walkInFailed" };
    revalidatePath("/workspace");
    if (!result) return { done: done! };
    return { confirmation: { ...(result.clientName ? { clientName: result.clientName } : {}), barberName: result.barberName, startsAt: result.appointment.startsAt.toISOString(),
      services: result.services, totalPriceMinor: result.totalPriceMinor, currency: result.currency, timeZone: result.timeZone } };
  } catch (error) {
    if (error instanceof SlotUnavailableError) return { error: "walkInNoBarber" };
    if (error instanceof ClientPhoneExistsError) return { error: "bookingPhoneExists" };
    if (error instanceof WalkInQueueDisabledError) return { error: "walkInQueueOff" };
    return { error: "walkInFailed" };
  }
}
