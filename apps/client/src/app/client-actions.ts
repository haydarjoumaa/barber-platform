"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CancellationDeadlineError, createClientBookings, getDatabase, SlotUnavailableError } from "@barber/database";
import type { MessageKey } from "@barber/shared";
import { clientAccounts, clientCookieName, clientShop, clientToken, requireClientOrigin, setClientCookie } from "./client-server";

export interface ClientActionState { error?: MessageKey; success?: boolean; }
export interface ClientSearchState extends ClientActionState { queryKey?: string; result?: Awaited<ReturnType<ReturnType<typeof createClientBookings>["search"]>>; }
export interface ClientReserveState extends ClientActionState { confirmation?: Awaited<ReturnType<ReturnType<typeof createClientBookings>["create"]>>; }
const field = (form: FormData, key: string) => typeof form.get(key) === "string" ? form.get(key) as string : "";
function failure(error: unknown, fallback: MessageKey): ClientActionState {
  if (error instanceof Error && error.message === "Too many attempts") return { error: "authRateLimited" };
  return { error: fallback };
}
async function context(slug: string) {
  await requireClientOrigin();
  const shop = await clientShop(slug);
  if (!shop) throw new Error("Shop unavailable");
  return { shop, token: await clientToken(shop.id) };
}
export async function clientSignIn(slug: string, _state: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    const { token } = await context(slug);
    await setClientCookie(await clientAccounts().login(slug, field(form, "phone"), field(form, "password"), token));
  } catch (error) { return failure(error, "clientLoginFailed"); }
  redirect(`/${slug}/account`);
}
export async function clientRegister(slug: string, _state: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    const { token } = await context(slug);
    await setClientCookie(await clientAccounts().register(slug, { name: field(form, "name"), phone: field(form, "phone"), password: field(form, "password"), email: field(form, "email"), birthday: field(form, "birthday") }, token));
  } catch (error) { return failure(error, "clientRegisterFailed"); }
  redirect(`/${slug}/account`);
}
export async function clientReset(slug: string, _state: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    const { shop } = await context(slug);
    await clientAccounts().reset(slug, { phone: field(form, "phone"), code: field(form, "code"), password: field(form, "password") });
    (await cookies()).delete(clientCookieName(shop.id));
    return { success: true };
  } catch (error) { return failure(error, "clientResetFailed"); }
}
export async function clientSignOut(slug: string) {
  const { shop, token } = await context(slug);
  await clientAccounts().logout(shop.id, token);
  (await cookies()).delete(clientCookieName(shop.id));
  redirect(`/${slug}`);
}
export async function clientSaveProfile(slug: string, _state: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    const { token } = await context(slug);
    await clientAccounts().updateProfile(slug, token, { name: field(form, "name"), email: field(form, "email"), birthday: field(form, "birthday") });
    revalidatePath(`/${slug}/account`);
    return { success: true };
  } catch { return { error: "clientProfileFailed" }; }
}
export async function clientSearch(slug: string, _state: ClientSearchState, form: FormData): Promise<ClientSearchState> {
  try {
    await context(slug);
    const date = field(form, "date"), barberId = field(form, "barberId"), serviceIds = form.getAll("serviceId").filter((id): id is string => typeof id === "string");
    const result = await createClientBookings(getDatabase()).search(slug, { date, serviceIds, ...(barberId ? { barberId } : {}) });
    return { result, queryKey: JSON.stringify([date, barberId, [...serviceIds].sort()]) };
  } catch (error) { return failure(error, "clientBookingFailed"); }
}
export async function clientReserve(slug: string, _state: ClientReserveState, form: FormData): Promise<ClientReserveState> {
  try {
    const { token } = await context(slug);
    const serviceIds = form.getAll("serviceId").filter((id): id is string => typeof id === "string");
    const slot = field(form, "slot").split("|");
    if (slot.length !== 2 || !/^\d{1,16}$/.test(slot[1] ?? "")) throw new Error("Invalid slot");
    const confirmation = await createClientBookings(getDatabase()).create(slug, token, { date: field(form, "date"), serviceIds, barberId: slot[0]!, startsAt: Number(slot[1]),
      ...(field(form, "identity") === "guest" ? { guest: { name: field(form, "name"), phone: field(form, "phone") } } : {}) });
    revalidatePath(`/${slug}/account`);
    return { confirmation };
  } catch (error) { return error instanceof SlotUnavailableError ? { error: "bookingSlotTaken" } : failure(error, "clientBookingFailed"); }
}
export async function clientCancel(slug: string, _state: ClientActionState, form: FormData): Promise<ClientActionState> {
  try {
    const { token } = await context(slug);
    await createClientBookings(getDatabase()).cancel(slug, token, field(form, "appointmentId"), field(form, "startsAt"));
    revalidatePath(`/${slug}/account`);
    return { success: true };
  } catch (error) { return { error: error instanceof CancellationDeadlineError ? "clientCancelDeadline" : "bookingCancelFailed" }; }
}
