"use server";

import { revalidatePath } from "next/cache";
import { createBarberSchedules, getDatabase } from "@barber/database";
import { LocalTimeError, type MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { periodFromForm, scheduleField, timeOffFromForm } from "./schedule-input";

export interface ScheduleFormState {
  error?: MessageKey; success?: boolean; problem?: string;
  preview?: { date: string; timeZone: string; working: { start: number; end: number }[]; unavailable: { start: number; end: number }[] };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveSchedule(_state: ScheduleFormState, form: FormData): Promise<ScheduleFormState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId");
    const barberId = scheduleField(form, "barberId");
    const operation = scheduleField(form, "operation");
    if (!uuid.test(shopId) || (!["closure", "removeClosure"].includes(operation) && !uuid.test(barberId))) return { error: "scheduleInvalid" };
    const schedules = createBarberSchedules(getDatabase());
    if (operation === "closure") {
      await schedules.addClosure(principal, shopId, scheduleField(form, "date"));
    } else if (operation === "removeClosure") {
      const id = scheduleField(form, "id");
      if (!uuid.test(id)) return { error: "scheduleInvalid" };
      await schedules.removeClosure(principal, shopId, id);
    } else if (operation === "override") {
      let input: unknown;
      try { input = JSON.parse(scheduleField(form, "periods")); } catch { return { error: "scheduleInvalid" }; }
      await schedules.saveOverride(principal, shopId, barberId, scheduleField(form, "date"), input);
    } else if (operation === "period") {
      let input;
      try { input = periodFromForm(form); } catch { return { error: "scheduleInvalid" }; }
      await schedules.addPeriod(principal, shopId, barberId, input);
    } else if (operation === "timeOff") {
      let input;
      try { input = timeOffFromForm(form); } catch { return { error: "scheduleInvalid" }; }
      await schedules.addTimeOff(principal, shopId, barberId, input);
    } else if (operation === "remove") {
      const id = scheduleField(form, "id");
      const kind = scheduleField(form, "recordKind");
      if (!uuid.test(id) || (kind !== "period" && kind !== "timeOff" && kind !== "override")) return { error: "scheduleInvalid" };
      await schedules.remove(principal, shopId, barberId, id, kind);
    } else if (operation === "preview") {
      return { preview: await schedules.preview(principal, shopId, barberId, scheduleField(form, "date")) };
    } else return { error: "scheduleInvalid" };
    revalidatePath("/workspace");
    return { success: true };
  } catch (error) {
    if (error instanceof LocalTimeError) return {
      error: error.code === "AMBIGUOUS_TIME" ? "scheduleAmbiguous" : "scheduleNonexistent",
      problem: `${error.endpoint.date} ${error.endpoint.time}`,
    };
    return { error: "scheduleFailed" };
  }
}
