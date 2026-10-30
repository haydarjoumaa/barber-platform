"use server";
import { redirect } from "next/navigation";
import type { MessageKey } from "@barber/shared";
import { accounts, requireAccountOrigin, setStaffCookie, staffToken } from "../account-server";
export interface JoinState { error?: MessageKey; }
export async function joinTeam(_state: JoinState, form: FormData): Promise<JoinState> {
  try {
    await requireAccountOrigin();
    const field = (key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
    await setStaffCookie(await accounts().acceptInvite({ email: field("email"), code: field("code"), password: field("password") }, await staffToken()));
  } catch { return { error: "teamJoinFailed" }; }
  redirect("/workspace");
}
