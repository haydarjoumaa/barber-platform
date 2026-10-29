import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ origin: vi.fn(), authenticate: vi.fn(), token: vi.fn(), revalidate: vi.fn(), savePolicy: vi.fn(), search: vi.fn(), create: vi.fn(), registerClient: vi.fn() }));
vi.mock("../account-server", () => ({ requireAccountOrigin: mocks.origin, staffToken: mocks.token, accounts: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@barber/database", () => ({ getDatabase: () => ({}), createBookingAvailability: () => mocks, createOwnerBookings: () => mocks, SlotUnavailableError: class extends Error {}, ClientPhoneExistsError: class extends Error {}, BookingPolicyMissingError: class extends Error {} }));
import { SlotUnavailableError } from "@barber/database";
import { bookingAction, registerClientAction } from "./booking-actions";
const shopId = "00000000-0000-4000-8000-000000000001", serviceId = "00000000-0000-4000-8000-000000000002";
const principal = { userId: "verified", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ shopId, operation: "search", date: "2026-07-01", serviceId, ...fields })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue(principal); });
describe("booking owner actions", () => {
  it("passes only selections and verified identity, ignoring supplied prices, clocks and policies", async () => {
    await bookingAction({}, form({ now: "2000-01-01", priceMinor: "1", minimumNoticeMinutes: "0", role: "OWNER" }));
    expect(mocks.search).toHaveBeenCalledWith(principal, shopId, { date: "2026-07-01", serviceIds: [serviceId] });
  });
  it("checks origin and session before lookup", async () => {
    mocks.origin.mockRejectedValueOnce(new Error("origin"));
    expect(await bookingAction({}, form())).toEqual({ error: "bookingFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    mocks.authenticate.mockResolvedValue(null);
    expect(await bookingAction({}, form())).toEqual({ error: "serviceSignIn" });
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("rejects duplicate or malformed service selections", async () => {
    const duplicate = form(); duplicate.append("serviceId", serviceId);
    expect(await bookingAction({}, duplicate)).toEqual({ error: "bookingInvalid" });
    expect(await bookingAction({}, form({ serviceId: "foreign-invalid-id" }))).toEqual({ error: "bookingInvalid" });
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("requires every policy field and rejects invalid approval modes", async () => {
    expect(await bookingAction({}, form({ operation: "policy" }))).toEqual({ error: "bookingInvalid" });
    const settings = { operation: "policy", slotIntervalMinutes: "15", minimumNoticeMinutes: "60", bufferAfterMinutes: "10", cancellationNoticeMinutes: "120", reschedulingNoticeMinutes: "120", approvalMode: "MANUAL" };
    expect(await bookingAction({}, form(settings))).toEqual({ success: true });
    expect(mocks.savePolicy).toHaveBeenCalledWith(principal, shopId, { slotIntervalMinutes: 15, minimumNoticeMinutes: 60, bufferAfterMinutes: 10, cancellationNoticeMinutes: 120, reschedulingNoticeMinutes: 120, approvalMode: "MANUAL" });
    expect(await bookingAction({}, form({ ...settings, approvalMode: "UNKNOWN" }))).toEqual({ error: "bookingInvalid" });
  });
  it("keeps repository authorization failures generic", async () => {
    mocks.search.mockRejectedValue(new Error("Forbidden"));
    expect(await bookingAction({}, form())).toEqual({ error: "bookingFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("booking writes", () => {
  const clientId = "00000000-0000-4000-8000-000000000003", barberId = "00000000-0000-4000-8000-000000000004";
  const fields = { operation: "reserve", clientId, barberId, startsAt: "1782885600000" };
  it("creates only from verified selections and returns authoritative confirmation", async () => {
    mocks.create.mockResolvedValue({ appointment: { id: "saved", startsAt: new Date("2026-07-01T06:00Z"), status: "PENDING" }, barberName: "Barber", timeZone: "Asia/Beirut", currency: "USD", totalPriceMinor: 2000, services: [{ name: "Hair" }] });
    const state = await bookingAction({}, form({ ...fields, priceMinor: "1", status: "CONFIRMED", now: "0", role: "OWNER" }));
    expect(mocks.create).toHaveBeenCalledWith(principal, shopId, { date: "2026-07-01", clientId, barberId, startsAt: 1782885600000, serviceIds: [serviceId] });
    expect(state.confirmation).toMatchObject({ id: "saved", status: "PENDING", totalPriceMinor: 2000 });
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace");
  });
  it("blocks writes without origin/session or valid identifiers and exact instants", async () => {
    mocks.origin.mockRejectedValueOnce(new Error("origin"));
    expect(await bookingAction({}, form(fields))).toEqual({ error: "bookingFailed" });
    mocks.authenticate.mockResolvedValueOnce(null);
    expect(await bookingAction({}, form(fields))).toEqual({ error: "serviceSignIn" });
    for (const invalid of [{ clientId: "" }, { barberId: "" }, { startsAt: "1.5" }, { startsAt: "NaN" }, { startsAt: "9999999999999999" }]) {
      expect(await bookingAction({}, form({ ...fields, ...invalid }))).toEqual({ error: "bookingInvalid" });
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("maps conflicts safely and keeps authorization failures generic", async () => {
    mocks.create.mockRejectedValueOnce(new SlotUnavailableError());
    expect(await bookingAction({}, form(fields))).toEqual({ error: "bookingSlotTaken" });
    mocks.create.mockRejectedValueOnce(new Error("private database details"));
    expect(await bookingAction({}, form(fields))).toEqual({ error: "bookingFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("registers only explicit client fields and validates international numbers", async () => {
    expect(await registerClientAction({}, form({ name: " A ", phone: "+96170123456", password: "ignored", role: "OWNER" }))).toEqual({ success: true });
    expect(mocks.registerClient).toHaveBeenCalledWith(principal, shopId, { name: "A", phone: "+96170123456" });
    mocks.registerClient.mockClear();
    expect(await registerClientAction({}, form({ name: "A", phone: "70123456" }))).toEqual({ error: "bookingClientInvalid" });
    expect(mocks.registerClient).not.toHaveBeenCalled();
    mocks.origin.mockRejectedValueOnce(new Error("origin"));
    expect(await registerClientAction({}, form({ name: "A", phone: "+96170123456" }))).toEqual({ error: "bookingClientFailed" });
    expect(mocks.registerClient).not.toHaveBeenCalled();
  });
});
