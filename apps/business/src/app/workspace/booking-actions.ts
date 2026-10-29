"use server";

import { revalidatePath } from "next/cache";
import { createBookingAvailability, getDatabase, BookingPolicyMissingError, createOwnerBookings, SlotUnavailableError, ClientPhoneExistsError, type OwnerBookingInput } from "@barber/database";
import { LocalTimeError, validateBookingPolicy, type BookingPolicy, type MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface BookingFormState {
  error?: MessageKey; success?: boolean; problem?: string; queryKey?: string;
  confirmation?: { id: string; clientName?: string; barberName: string; startsAt: string; status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW"; totalPriceMinor: number; currency: string; timeZone: string; services: string[] };
  result?: Awaited<ReturnType<ReturnType<typeof createBookingAvailability>["search"]>>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function bookingAction(_state: BookingFormState, form: FormData): Promise<BookingFormState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId");
    if (!uuid.test(shopId)) return { error: "bookingInvalid" };
    const booking = createBookingAvailability(getDatabase());
    if (scheduleField(form, "operation") === "policy") {
      let input: BookingPolicy;
      try {
        const number = (key: string) => { const value = scheduleField(form, key); if (!/^\d{1,10}$/.test(value)) throw new Error("Invalid integer"); return Number(value); };
        input = validateBookingPolicy({ slotIntervalMinutes: number("slotIntervalMinutes"), minimumNoticeMinutes: number("minimumNoticeMinutes"), bufferAfterMinutes: number("bufferAfterMinutes"),
          cancellationNoticeMinutes: number("cancellationNoticeMinutes"), reschedulingNoticeMinutes: number("reschedulingNoticeMinutes"), approvalMode: scheduleField(form, "approvalMode") as BookingPolicy["approvalMode"] });
      } catch { return { error: "bookingInvalid" }; }
      await booking.savePolicy(principal, shopId, input);
      revalidatePath("/workspace");
      return { success: true };
    }
    const operation = scheduleField(form, "operation");
    if (operation !== "search" && operation !== "reserve") return { error: "bookingInvalid" };
    const date = scheduleField(form, "date");
    const barberId = scheduleField(form, "barberId");
    const serviceIds = form.getAll("serviceId");
    if (!serviceIds.length || serviceIds.some(id => typeof id !== "string" || !uuid.test(id)) || new Set(serviceIds).size !== serviceIds.length || (barberId && !uuid.test(barberId))) return { error: "bookingInvalid" };
    const ids = serviceIds as string[];
    if (operation === "reserve") {
      const clientId = scheduleField(form, "clientId"), startsAt = scheduleField(form, "startsAt");
      if (!uuid.test(barberId) || !/^\d{1,16}$/.test(startsAt) || !Number.isSafeInteger(Number(startsAt))) return { error: "bookingInvalid" };
      const mode = scheduleField(form, "identityMode") || "existing";
      const common = { date, barberId, serviceIds: ids, startsAt: Number(startsAt) };
      let input: OwnerBookingInput;
      if (mode === "existing") {
        if (!uuid.test(clientId)) return { error: "bookingInvalid" };
        input = { ...common, clientId };
      } else if (mode === "guest" || mode === "new") {
        const name = scheduleField(form, "contactName").trim(), phone = scheduleField(form, "contactPhone").trim();
        if (!name || name.length > 100 || (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) || (mode === "new" && !phone)) return { error: "bookingContactInvalid" };
        input = mode === "guest" ? { ...common, guest: { name, phone } } : { ...common, newClient: { name, phone } };
      } else return { error: "bookingInvalid" };
      const saved = await createOwnerBookings(getDatabase()).create(principal, shopId, input);
      revalidatePath("/workspace");
      return { confirmation: { id: saved.appointment.id, startsAt: saved.appointment.startsAt.toISOString(), status: saved.appointment.status,
        clientName: saved.clientName, barberName: saved.barberName, timeZone: saved.timeZone, currency: saved.currency, totalPriceMinor: saved.totalPriceMinor, services: saved.services.map(service => service.name) } };
    }
    return { result: await booking.search(principal, shopId, { date, serviceIds: ids, ...(barberId ? { barberId } : {}) }), queryKey: JSON.stringify([date, barberId, [...ids].sort()]) };
  } catch (error) {
    if (error instanceof ClientPhoneExistsError) return { error: "bookingPhoneExists" };
    if (error instanceof SlotUnavailableError) return { error: "bookingSlotTaken" };
    if (error instanceof BookingPolicyMissingError) return { error: "bookingPolicyRequired" };
    if (error instanceof LocalTimeError) return { error: error.code === "AMBIGUOUS_TIME" ? "scheduleAmbiguous" : "scheduleNonexistent", problem: `${error.endpoint.date} ${error.endpoint.time}` };
    return { error: "bookingFailed" };
  }
}

export async function registerClientAction(_state: BookingFormState, form: FormData): Promise<BookingFormState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), name = scheduleField(form, "name").trim(), phone = scheduleField(form, "phone").trim();
    if (!uuid.test(shopId) || !name || name.length > 100 || !/^\+[1-9]\d{7,14}$/.test(phone)) return { error: "bookingClientInvalid" };
    await createOwnerBookings(getDatabase()).registerClient(principal, shopId, { name, phone });
    revalidatePath("/workspace");
    return { success: true };
  } catch { return { error: "bookingClientFailed" }; }
}
