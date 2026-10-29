import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  origin: vi.fn(), authenticate: vi.fn(), token: vi.fn(), revalidate: vi.fn(),
  list: vi.fn(), createService: vi.fn(), updateService: vi.fn(), archiveService: vi.fn(), setCurrency: vi.fn(),
}));
vi.mock("../account-server", () => ({ requireAccountOrigin: mocks.origin, staffToken: mocks.token, accounts: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@barber/database", () => ({ getDatabase: () => ({}), createServiceCatalog: () => mocks }));
import { saveService } from "./service-actions";

const shopId = "00000000-0000-4000-8000-000000000001";
const serviceId = "00000000-0000-4000-8000-000000000002";
const principal = { userId: "verified-user", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ shopId, serviceId, operation: "create", name: "Haircut", duration: "30", price: "12.50", displayedCurrency: "USD", ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue("session-token");
  mocks.authenticate.mockResolvedValue(principal);
  mocks.list.mockResolvedValue({ currency: "USD" });
});
describe("service actions", () => {
  it("uses session identity and authoritative currency, ignoring submitted role and priceMinor", async () => {
    expect(await saveService({}, form({ currency: "JPY", role: "OWNER", userId: "attacker", priceMinor: "1" }))).toEqual({ success: true });
    expect(mocks.authenticate).toHaveBeenCalledWith("session-token");
    expect(mocks.createService).toHaveBeenCalledWith(principal, shopId, { name: "Haircut", durationMinutes: 30, priceMinor: 1250 }, "USD");
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace");
  });
  it("stops before authentication and writes when the origin is invalid", async () => {
    mocks.origin.mockRejectedValue(new Error("Invalid origin"));
    expect(await saveService({}, form())).toEqual({ error: "serviceFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
  });
  it("requires an active session", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect(await saveService({}, form())).toEqual({ error: "serviceSignIn" });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("does not write when the owner catalog denies access", async () => {
    mocks.list.mockRejectedValue(new Error("Forbidden"));
    expect(await saveService({}, form())).toEqual({ error: "serviceFailed" });
    expect(mocks.createService).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([{ price: "1.001" }, { duration: "0" }, { duration: "1.5" }, { duration: "2147483648" }, { name: " " }, { shopId: "invalid" }, { operation: "delete" }])("rejects invalid fields %o", async overrides => {
    expect(await saveService({}, form(overrides))).toEqual({ error: "serviceInvalid" });
    expect(mocks.createService).not.toHaveBeenCalled();
  });
  it("requires configured currency", async () => {
    mocks.list.mockResolvedValue({ currency: null });
    expect(await saveService({}, form())).toEqual({ error: "serviceCurrencyRequired" });
    expect(mocks.createService).not.toHaveBeenCalled();
  });
  it("rejects an outdated displayed currency instead of relabeling the entered amount", async () => {
    mocks.list.mockResolvedValue({ currency: "JPY" });
    expect(await saveService({}, form())).toEqual({ error: "serviceFailed" });
    expect(mocks.createService).not.toHaveBeenCalled();
  });
  it("delegates edits and archives to owner-authorized repositories", async () => {
    expect(await saveService({}, form({ operation: "update" }))).toEqual({ success: true });
    expect(mocks.updateService).toHaveBeenCalledWith(principal, shopId, serviceId, { name: "Haircut", durationMinutes: 30, priceMinor: 1250 });
    mocks.archiveService.mockRejectedValue(new Error("Service not found"));
    expect(await saveService({}, form({ operation: "archive" }))).toEqual({ error: "serviceFailed" });
    expect(mocks.archiveService).toHaveBeenCalledWith(principal, shopId, serviceId);
  });
  it("configures currency using the verified principal", async () => {
    expect(await saveService({}, form({ operation: "currency", currency: "LBP" }))).toEqual({ success: true });
    expect(mocks.setCurrency).toHaveBeenCalledWith(principal, shopId, "LBP");
  });
});
