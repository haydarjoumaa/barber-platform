"use server";

import { revalidatePath } from "next/cache";
import { createOwnerBookings, getDatabase, CancellationDeadlineError } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface AppointmentActionState { error?: MessageKey; success?: boolean; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function correctAppointmentOutcome(_state: AppointmentActionState, form: FormData): Promise<AppointmentActionState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), appointmentId = scheduleField(form, "appointmentId");
    const expectedStatus = scheduleField(form, "expectedStatus"), outcome = scheduleField(form, "outcome"), reason = scheduleField(form, "reason");
    if (!uuid.test(shopId) || !uuid.test(appointmentId) || (expectedStatus !== "COMPLETED" && expectedStatus !== "NO_SHOW") || (outcome !== "COMPLETED" && outcome !== "NO_SHOW")) return { error: "bookingOutcomeFailed" };
    await createOwnerBookings(getDatabase()).correctOutcome(principal, shopId, appointmentId, { expectedStatus, outcome, reason });
    revalidatePath("/workspace", "layout");
    return { success: true };
  } catch { return { error: "bookingOutcomeFailed" }; }
}

export async function recordAppointmentOutcome(_state: AppointmentActionState, form: FormData): Promise<AppointmentActionState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), appointmentId = scheduleField(form, "appointmentId");
    const expectedStatus = scheduleField(form, "expectedStatus"), outcome = scheduleField(form, "outcome");
    if (!uuid.test(shopId) || !uuid.test(appointmentId) || (expectedStatus !== "PENDING" && expectedStatus !== "CONFIRMED") || (outcome !== "COMPLETED" && outcome !== "NO_SHOW")) return { error: "bookingOutcomeFailed" };
    await createOwnerBookings(getDatabase()).recordOutcome(principal, shopId, appointmentId, { expectedStatus, outcome });
    revalidatePath("/workspace");
    return { success: true };
  } catch { return { error: "bookingOutcomeFailed" }; }
}

export async function cancelAppointment(_state: AppointmentActionState, form: FormData): Promise<AppointmentActionState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), appointmentId = scheduleField(form, "appointmentId");
    const expectedStatus = scheduleField(form, "expectedStatus"), override = scheduleField(form, "overrideDeadline");
    if (!uuid.test(shopId) || !uuid.test(appointmentId) || (expectedStatus !== "PENDING" && expectedStatus !== "CONFIRMED") || !["", "on"].includes(override)) return { error: "bookingCancelFailed" };
    await createOwnerBookings(getDatabase()).cancel(principal, shopId, appointmentId, { expectedStatus, overrideDeadline: override === "on" });
    revalidatePath("/workspace");
    return { success: true };
  } catch (error) {
    return { error: error instanceof CancellationDeadlineError ? "bookingCancelDeadline" : "bookingCancelFailed" };
  }
}

export async function confirmAppointment(_state: AppointmentActionState, form: FormData): Promise<AppointmentActionState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), appointmentId = scheduleField(form, "appointmentId");
    if (!uuid.test(shopId) || !uuid.test(appointmentId)) return { error: "bookingConfirmFailed" };
    await createOwnerBookings(getDatabase()).confirm(principal, shopId, appointmentId);
    revalidatePath("/workspace");
    return { success: true };
  } catch { return { error: "bookingConfirmFailed" }; }
}
