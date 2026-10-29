import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ origin: vi.fn(), authenticate: vi.fn(), token: vi.fn(), revalidate: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), recordOutcome: vi.fn() }));
vi.mock("../account-server", () => ({ requireAccountOrigin: mocks.origin, staffToken: mocks.token, accounts: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@barber/database", () => ({ getDatabase: () => ({}), createOwnerBookings: () => mocks, CancellationDeadlineError: class extends Error {} }));
import { confirmAppointment, cancelAppointment, recordAppointmentOutcome } from "./appointment-actions";
const shopId = "00000000-0000-4000-8000-000000000001", appointmentId = "00000000-0000-4000-8000-000000000002";
const principal = { userId: "verified", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ shopId, appointmentId, ...fields })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue(principal); });
describe("owner appointment approval", () => {
  it("uses verified identity and ignores submitted status and actor", async () => {
    expect(await confirmAppointment({}, form({ status: "CANCELLED", userId: "forged" }))).toEqual({ success: true });
    expect(mocks.confirm).toHaveBeenCalledWith(principal, shopId, appointmentId);
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace");
  });
  it("requires origin, authentication and valid identifiers before mutation", async () => {
    mocks.origin.mockRejectedValueOnce(new Error("origin"));
    expect(await confirmAppointment({}, form())).toEqual({ error: "bookingConfirmFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    mocks.authenticate.mockResolvedValueOnce(null);
    expect(await confirmAppointment({}, form())).toEqual({ error: "serviceSignIn" });
    for (const invalid of [{ shopId: "bad" }, { appointmentId: "" }]) {
      expect(await confirmAppointment({}, form(invalid))).toEqual({ error: "bookingConfirmFailed" });
    }
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("does not expose repository errors or report a failed write as successful", async () => {
    mocks.confirm.mockRejectedValue(new Error("private details"));
    expect(await confirmAppointment({}, form())).toEqual({ error: "bookingConfirmFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});


describe("owner cancellation action", () => {
  it("passes only verified identity, expected state and explicit override", async () => {
    expect(await cancelAppointment({}, form({ expectedStatus: "PENDING", now: "0", role: "OWNER", cancellationNoticeMinutes: "0" }))).toEqual({ success: true });
    expect(mocks.cancel).toHaveBeenLastCalledWith(principal, shopId, appointmentId, { expectedStatus: "PENDING", overrideDeadline: false });
    await cancelAppointment({}, form({ expectedStatus: "CONFIRMED", overrideDeadline: "on" }));
    expect(mocks.cancel).toHaveBeenLastCalledWith(principal, shopId, appointmentId, { expectedStatus: "CONFIRMED", overrideDeadline: true });
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace");
  });
  it("requires origin, session, identifiers and an active expected status", async () => {
    mocks.origin.mockRejectedValueOnce(new Error("origin"));
    expect(await cancelAppointment({}, form({ expectedStatus: "PENDING" }))).toEqual({ error: "bookingCancelFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    mocks.authenticate.mockResolvedValueOnce(null);
    expect(await cancelAppointment({}, form())).toEqual({ error: "serviceSignIn" });
    for (const fields of [{ shopId: "bad" }, { appointmentId: "" }, { expectedStatus: "CANCELLED" }, { overrideDeadline: "true" }]) {
      expect(await cancelAppointment({}, form({ expectedStatus: "PENDING", ...fields }))).toEqual({ error: "bookingCancelFailed" });
    }
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("distinguishes deadline errors without exposing repository details", async () => {
    const { CancellationDeadlineError } = await import("@barber/database");
    mocks.cancel.mockRejectedValueOnce(new CancellationDeadlineError());
    expect(await cancelAppointment({}, form({ expectedStatus: "PENDING" }))).toEqual({ error: "bookingCancelDeadline" });
    mocks.cancel.mockRejectedValueOnce(new Error("private details"));
    expect(await cancelAppointment({}, form({ expectedStatus: "PENDING" }))).toEqual({ error: "bookingCancelFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});


describe("owner appointment outcomes", () => {
  it.each(["COMPLETED", "NO_SHOW"])("records %s using only verified identity and explicit selections", async outcome => {
    expect(await recordAppointmentOutcome({}, form({ expectedStatus: "CONFIRMED", outcome, userId: "forged", paid: "true", role: "OWNER" }))).toEqual({ success: true });
    expect(mocks.recordOutcome).toHaveBeenCalledWith(principal, shopId, appointmentId, { expectedStatus: "CONFIRMED", outcome });
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace");
  });
  it("requires origin, session, valid identifiers and allowed transitions", async () => {
    const valid = { expectedStatus: "PENDING", outcome: "COMPLETED" };
    mocks.origin.mockRejectedValueOnce(new Error("origin"));
    expect(await recordAppointmentOutcome({}, form(valid))).toEqual({ error: "bookingOutcomeFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    mocks.authenticate.mockResolvedValueOnce(null);
    expect(await recordAppointmentOutcome({}, form(valid))).toEqual({ error: "serviceSignIn" });
    for (const invalid of [{ shopId: "bad" }, { appointmentId: "" }, { expectedStatus: "CANCELLED" }, { expectedStatus: "COMPLETED" }, { outcome: "CONFIRMED" }, { outcome: "" }]) {
      expect(await recordAppointmentOutcome({}, form({ ...valid, ...invalid }))).toEqual({ error: "bookingOutcomeFailed" });
    }
    expect(mocks.recordOutcome).not.toHaveBeenCalled();
  });
  it("keeps repository errors private and does not report success", async () => {
    mocks.recordOutcome.mockRejectedValue(new Error("private details"));
    expect(await recordAppointmentOutcome({}, form({ expectedStatus: "PENDING", outcome: "NO_SHOW" }))).toEqual({ error: "bookingOutcomeFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
