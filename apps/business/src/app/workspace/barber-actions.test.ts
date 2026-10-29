import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  origin: vi.fn(), authenticate: vi.fn(), token: vi.fn(), revalidate: vi.fn(),
  list: vi.fn(), createBarber: vi.fn(), renameBarber: vi.fn(), setBarberService: vi.fn(), removeBarberService: vi.fn(),
}));
vi.mock("../account-server", () => ({ requireAccountOrigin: mocks.origin, staffToken: mocks.token, accounts: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@barber/database", () => ({ getDatabase: () => ({}), createServiceCatalog: () => mocks }));
import { saveBarber } from "./barber-actions";

const shopId = "00000000-0000-4000-8000-000000000001";
const barberId = "00000000-0000-4000-8000-000000000002";
const serviceId = "00000000-0000-4000-8000-000000000003";
const membershipId = "00000000-0000-4000-8000-000000000004";
const principal = { userId: "verified-user", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ shopId, barberId, serviceId, membershipId, operation: "create", displayName: "Owner barber", duration: "", price: "", displayedCurrency: "USD", ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue("session-token");
  mocks.authenticate.mockResolvedValue(principal);
  mocks.list.mockResolvedValue({ currency: "USD" });
});
describe("barber management actions", () => {
  it("uses verified identity to create a separate profile", async () => {
    expect(await saveBarber({}, form({ userId: "forged", role: "OWNER" }))).toEqual({ success: true });
    expect(mocks.authenticate).toHaveBeenCalledWith("session-token");
    expect(mocks.createBarber).toHaveBeenCalledWith(principal, shopId, membershipId, "Owner barber");
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace");
  });
  it("rejects cross-origin requests before session or catalog access", async () => {
    mocks.origin.mockRejectedValue(new Error("Origin"));
    expect(await saveBarber({}, form())).toEqual({ error: "barberFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createBarber).not.toHaveBeenCalled();
  });
  it("requires a session", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect(await saveBarber({}, form())).toEqual({ error: "serviceSignIn" });
    expect(mocks.createBarber).not.toHaveBeenCalled();
  });
  it("does not expose tenant or duplicate errors", async () => {
    mocks.createBarber.mockRejectedValue(new Error("Member belongs to another shop"));
    expect(await saveBarber({}, form())).toEqual({ error: "barberFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([{ membershipId: "invalid" }, { displayName: " " }, { displayName: "x".repeat(101) }, { shopId: "invalid" }, { operation: "delete" }])("rejects malformed profile fields %o", async fields => {
    expect(await saveBarber({}, form(fields))).toEqual({ error: "barberInvalid" });
    expect(mocks.createBarber).not.toHaveBeenCalled();
  });
  it("renames through the authorized repository", async () => {
    expect(await saveBarber({}, form({ operation: "rename" }))).toEqual({ success: true });
    expect(mocks.renameBarber).toHaveBeenCalledWith(principal, shopId, barberId, "Owner barber");
  });
  it("blank overrides inherit while an explicit zero price stays zero", async () => {
    expect(await saveBarber({}, form({ operation: "assign" }))).toEqual({ success: true });
    expect(mocks.setBarberService).toHaveBeenLastCalledWith(principal, shopId, barberId, serviceId, { durationMinutes: null, priceMinor: null });
    expect(await saveBarber({}, form({ operation: "assign", price: "0", duration: "45" }))).toEqual({ success: true });
    expect(mocks.setBarberService).toHaveBeenLastCalledWith(principal, shopId, barberId, serviceId, { durationMinutes: 45, priceMinor: 0 });
  });
  it("converts using authoritative currency", async () => {
    mocks.list.mockResolvedValue({ currency: "KWD" });
    expect(await saveBarber({}, form({ operation: "assign", displayedCurrency: "KWD", price: "١٫٢٣٤" }))).toEqual({ success: true });
    expect(mocks.setBarberService).toHaveBeenCalledWith(principal, shopId, barberId, serviceId, { durationMinutes: null, priceMinor: 1234 });
  });
  it.each([{ duration: "0" }, { duration: "1.5" }, { duration: "2147483648" }, { price: "-1" }, { price: "1.001" }, { barberId: "invalid" }, { serviceId: "invalid" }])("rejects malformed overrides %o", async fields => {
    expect(await saveBarber({}, form({ operation: "assign", ...fields }))).toEqual({ error: "barberInvalid" });
    expect(mocks.setBarberService).not.toHaveBeenCalled();
  });
  it("stops assignments when the catalog denies access or currency changed", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Forbidden"));
    expect(await saveBarber({}, form({ operation: "assign" }))).toEqual({ error: "barberFailed" });
    mocks.list.mockResolvedValueOnce({ currency: "JPY" });
    expect(await saveBarber({}, form({ operation: "assign" }))).toEqual({ error: "barberFailed" });
    expect(mocks.setBarberService).not.toHaveBeenCalled();
  });
  it("removes only through the scoped repository", async () => {
    expect(await saveBarber({}, form({ operation: "remove" }))).toEqual({ success: true });
    expect(mocks.removeBarberService).toHaveBeenCalledWith(principal, shopId, barberId, serviceId);
  });
});
