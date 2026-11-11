import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ origin: vi.fn(), authenticate: vi.fn(), token: vi.fn(), revalidate: vi.fn(), access: vi.fn() }));
vi.mock("../account-server", () => ({ requireAccountOrigin: mocks.origin, staffToken: mocks.token, accounts: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@barber/database", () => ({ getDatabase: () => ({}), createStaffTeam: () => ({ access: mocks.access }) }));
import { saveTeam } from "./team-actions";

const shopId = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const principal = { userId: "verified-owner", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
function form(overrides: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ shopId, id, operation: "disable-access", confirm: "on", ...overrides })) result.set(key, value);
  return result;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue("verified-session");
  mocks.authenticate.mockResolvedValue(principal);
});
describe("staff access controls", () => {
  it.each([ ["disable-access", true], ["restore-access", false] ] as const)("%s uses verified identity", async (operation, disabled) => {
    expect(await saveTeam({}, form({ operation, userId: "forged" }))).toEqual({ success: true });
    expect(mocks.access).toHaveBeenCalledWith(principal, shopId, id, disabled);
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace", "layout");
  });
  it.each([{ confirm: "" }, { confirm: "true" }, { id: "invalid" }, { shopId: "invalid" }, { operation: "remove" }])("rejects invalid or unconfirmed changes %o", async input => {
    expect(await saveTeam({}, form(input))).toEqual({ error: "teamFailed" });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before authentication", async () => {
    mocks.origin.mockRejectedValue(new Error("Origin"));
    expect(await saveTeam({}, form())).toEqual({ error: "teamFailed" });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("requires a session", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect(await saveTeam({}, form())).toEqual({ error: "serviceSignIn" });
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it("does not expose repository authorization or stale-state errors", async () => {
    mocks.access.mockRejectedValue(new Error("Member unavailable"));
    expect(await saveTeam({}, form())).toEqual({ error: "teamFailed" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
