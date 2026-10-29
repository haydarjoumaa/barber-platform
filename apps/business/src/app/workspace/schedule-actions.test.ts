import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalTimeError } from "@barber/shared";
import { periodFromForm } from "./schedule-input";
const mocks = vi.hoisted(() => ({ origin: vi.fn(), authenticate: vi.fn(), token: vi.fn(), revalidate: vi.fn(), addPeriod: vi.fn(), addTimeOff: vi.fn(), remove: vi.fn(), preview: vi.fn(), saveOverride: vi.fn(), addClosure: vi.fn(), removeClosure: vi.fn() }));
vi.mock("../account-server", () => ({ requireAccountOrigin: mocks.origin, staffToken: mocks.token, accounts: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@barber/database", () => ({ getDatabase: () => ({}), createBarberSchedules: () => mocks }));
import { saveSchedule } from "./schedule-actions";
const shopId = "00000000-0000-4000-8000-000000000001";
const barberId = "00000000-0000-4000-8000-000000000002";
const principal = { userId: "verified", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ shopId, barberId, operation: "period", dayOfWeek: "3", kind: "WORK", startTime: "22:00", endTime: "02:00", startOffset: "0", endOffset: "1", ...fields })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue(principal); mocks.token.mockResolvedValue("token"); });
describe("schedule actions", () => {
  it("passes session identity and explicit overnight hours", async () => {
    expect(await saveSchedule({}, form({ userId: "forged", timeZone: "UTC" }))).toEqual({ success: true });
    expect(mocks.addPeriod).toHaveBeenCalledWith(principal, shopId, barberId, { dayOfWeek: 3, kind: "WORK", startMinute: 1320, endMinute: 1560, startOccurrence: null, endOccurrence: null });
  });
  it.each([{ startTime: "25:00" }, { dayOfWeek: "1e0" }, { endOffset: "0" }, { startOffset: "1" }, { startOccurrence: "auto" }, { kind: "INVALID" }])("rejects invalid periods %o", fields => {
    expect(() => periodFromForm(form(fields))).toThrow();
  });
  it("requires origin and session before writes", async () => {
    mocks.origin.mockRejectedValueOnce(new Error("origin"));
    expect(await saveSchedule({}, form())).toEqual({ error: "scheduleFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    mocks.authenticate.mockResolvedValueOnce(null);
    expect(await saveSchedule({}, form())).toEqual({ error: "serviceSignIn" });
    expect(mocks.addPeriod).not.toHaveBeenCalled();
  });
  it("does not leak repository access failures", async () => {
    mocks.addPeriod.mockRejectedValue(new Error("Foreign barber"));
    expect(await saveSchedule({}, form())).toEqual({ error: "scheduleFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each(["AMBIGUOUS_TIME", "NONEXISTENT_TIME"] as const)("surfaces %s with the affected local time", async code => {
    mocks.addTimeOff.mockRejectedValue(new LocalTimeError(code, { date: "2026-10-24", time: "23:30" }, "Asia/Beirut"));
    expect(await saveSchedule({}, form({ operation: "timeOff", startDate: "2026-10-24", endDate: "2026-10-25" }))).toEqual({ error: code === "AMBIGUOUS_TIME" ? "scheduleAmbiguous" : "scheduleNonexistent", problem: "2026-10-24 23:30" });
  });
  it("preserves explicit time-off occurrence choices", async () => {
    await saveSchedule({}, form({ operation: "timeOff", startDate: "2026-10-24", startTime: "23:30", startOccurrence: "later", endDate: "2026-10-25", endTime: "02:00" }));
    expect(mocks.addTimeOff).toHaveBeenCalledWith(principal, shopId, barberId, { start: { date: "2026-10-24", time: "23:30", occurrence: "later" }, end: { date: "2026-10-25", time: "02:00" } });
  });
  it("previews through the authenticated repository without invalidating cached pages", async () => {
    mocks.preview.mockResolvedValue({ date: "2026-07-02", timeZone: "Asia/Beirut", working: [], unavailable: [] });
    expect(await saveSchedule({}, form({ operation: "preview", date: "2026-07-02" }))).toHaveProperty("preview.date", "2026-07-02");
    expect(mocks.preview).toHaveBeenCalledWith(principal, shopId, barberId, "2026-07-02");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("scopes removal and rejects unknown record types", async () => {
    expect(await saveSchedule({}, form({ operation: "remove", id: barberId, recordKind: "timeOff" }))).toEqual({ success: true });
    expect(mocks.remove).toHaveBeenCalledWith(principal, shopId, barberId, barberId, "timeOff");
    expect(await saveSchedule({}, form({ operation: "remove", id: barberId, recordKind: "shop" }))).toEqual({ error: "scheduleInvalid" });
  });
  it("saves an empty date replacement and delegates validation to the repository", async () => {
    expect(await saveSchedule({}, form({ operation: "override", date: "2026-07-02", periods: "[]" }))).toEqual({ success: true });
    expect(mocks.saveOverride).toHaveBeenCalledWith(principal, shopId, barberId, "2026-07-02", []);
    expect(await saveSchedule({}, form({ operation: "override", periods: "bad json" }))).toEqual({ error: "scheduleInvalid" });
  });
  it("uses shop-level closure authorization without requiring a barber ID", async () => {
    expect(await saveSchedule({}, form({ operation: "closure", barberId: "", date: "2026-03-29" }))).toEqual({ success: true });
    expect(mocks.addClosure).toHaveBeenCalledWith(principal, shopId, "2026-03-29");
    expect(await saveSchedule({}, form({ operation: "removeClosure", barberId: "", id: barberId }))).toEqual({ success: true });
    expect(mocks.removeClosure).toHaveBeenCalledWith(principal, shopId, barberId);
    expect(await saveSchedule({}, form({ operation: "removeClosure", id: "invalid" }))).toEqual({ error: "scheduleInvalid" });
  });
  it("does not turn a denied closure mutation into success", async () => {
    mocks.addClosure.mockRejectedValue(new Error("Forbidden"));
    expect(await saveSchedule({}, form({ operation: "closure" }))).toEqual({ error: "scheduleFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
