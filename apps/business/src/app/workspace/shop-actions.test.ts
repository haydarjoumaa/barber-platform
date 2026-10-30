import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ origin: vi.fn(), authenticate: vi.fn(), token: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("../account-server", () => ({ requireAccountOrigin: mocks.origin, staffToken: mocks.token, accounts: () => ({ authenticate: mocks.authenticate }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@barber/database", () => ({ getDatabase: () => ({}), createShopProfiles: () => ({ update: mocks.update }), ShopProfileError: class extends Error { constructor(public code: string) { super(code); } } }));
import { saveShopProfile } from "./shop-actions";
import { ShopProfileError } from "@barber/database";
const shopId = "00000000-0000-4000-8000-000000000001";
const principal = { userId: "verified", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ shopId, name: " New name ", slug: " new-slug ", expectedName: "Old name", expectedSlug: "old-slug", ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue(principal); mocks.update.mockResolvedValue({ name: "New name", slug: "new-slug" }); });

it("uses verified identity, normalized values and original values without trusting role or publication input", async () => {
  expect(await saveShopProfile({}, form({ role: "OWNER", publishedAt: "now", userId: "forged" }))).toEqual({ saved: { name: "New name", slug: "new-slug" } });
  expect(mocks.update).toHaveBeenCalledWith(principal, shopId, { name: "New name", slug: "new-slug" }, { name: "Old name", slug: "old-slug" });
  expect(mocks.revalidate).toHaveBeenCalledWith("/workspace", "layout");
});
it("rejects bad origins and missing sessions before mutation", async () => {
  mocks.origin.mockRejectedValueOnce(new Error("origin"));
  expect(await saveShopProfile({}, form())).toEqual({ error: "shopProfileFailed" });
  expect(mocks.authenticate).not.toHaveBeenCalled();
  mocks.authenticate.mockResolvedValueOnce(null);
  expect(await saveShopProfile({}, form())).toEqual({ error: "serviceSignIn" });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects reserved slugs, malformed fields and missing concurrency values", async () => {
  for (const invalid of [{ shopId: "bad" }, { name: " " }, { name: "x".repeat(101) }, { slug: "business" }, { slug: "Uppercase" }, { slug: "bad--slug" }, { slug: "aa" }, { expectedName: "" }, { expectedSlug: "" }]) {
    expect(await saveShopProfile({}, form(invalid))).toEqual({ error: "shopProfileInvalid" });
  }
  expect(mocks.update).not.toHaveBeenCalled();
});
it("returns actionable conflicts without exposing database details", async () => {
  for (const [code, error] of [["STALE", "shopProfileStale"], ["SLUG_TAKEN", "shopSlugTaken"], ["INVALID", "shopProfileInvalid"]] as const) {
    mocks.update.mockRejectedValueOnce(new ShopProfileError(code));
    expect(await saveShopProfile({}, form())).toEqual({ error });
  }
  mocks.update.mockRejectedValueOnce(new Error("private database details"));
  expect(await saveShopProfile({}, form())).toEqual({ error: "shopProfileFailed" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
