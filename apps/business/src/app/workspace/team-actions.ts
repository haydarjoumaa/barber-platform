"use server";
import { revalidatePath } from "next/cache";
import { createStaffTeam, getDatabase } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, staffToken } from "../account-server";
import { scheduleField } from "./schedule-input";

export interface TeamState { error?: MessageKey; success?: boolean; code?: string; expiresAt?: string; }
export async function saveTeam(_state: TeamState, form: FormData): Promise<TeamState> {
  try {
    await requireAccountOrigin();
    const principal = await accounts().authenticate(await staffToken());
    if (!principal) return { error: "serviceSignIn" };
    const shopId = scheduleField(form, "shopId"), operation = scheduleField(form, "operation");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(shopId)) return { error: "teamFailed" };
    const team = createStaffTeam(getDatabase());
    const permissions = { manageAppointments: scheduleField(form, "manageAppointments") === "on", manageSchedules: scheduleField(form, "manageSchedules") === "on" };
    let result: TeamState = { success: true };
    if (operation === "invite") {
      const role = scheduleField(form, "role");
      if (role !== "BARBER" && role !== "RECEPTIONIST") return { error: "teamFailed" };
      result = { ...await team.invite(principal, shopId, { email: scheduleField(form, "email"), displayName: scheduleField(form, "displayName"), role, ...permissions }), success: true };
    } else {
      const id = scheduleField(form, "id");
      if (!uuid.test(id)) return { error: "teamFailed" };
      if (operation === "revoke") await team.revoke(principal, shopId, id);
      else if (operation === "permissions") await team.permissions(principal, shopId, id, permissions);
      else return { error: "teamFailed" };
    }
    revalidatePath("/workspace", "layout");
    return result;
  } catch { return { error: "teamFailed" }; }
}
