import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), get: vi.fn(), token: vi.fn() }));
vi.mock("../../account-server", () => ({ accounts: () => ({ authenticate: mocks.authenticate }), staffToken: mocks.token }));
vi.mock("@barber/database", () => ({ createClientProfiles: () => ({ get: mocks.get }), getDatabase: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "en" }) }) }));
vi.mock("@barber/ui", () => ({ LanguageSwitcher: () => null }));
import Page from "./[clientId]/page";
import { renderToStaticMarkup } from "react-dom/server";

const shopId = "00000000-0000-4000-8000-000000000001";
const clientId = "00000000-0000-4000-8000-000000000002";
const principal = { userId: "verified", memberships: [{ barbershopId: shopId, role: "OWNER" }] };
const request = (query: { shopId?: string; page?: string } = { shopId }) => ({ params: Promise.resolve({ clientId }), searchParams: Promise.resolve(query) });
beforeEach(() => { vi.resetAllMocks(); mocks.authenticate.mockResolvedValue(principal); mocks.get.mockResolvedValue(null); });

it("redirects anonymous visitors before reading profiles", async () => {
  mocks.authenticate.mockResolvedValue(null);
  await expect(Page(request())).rejects.toThrow("redirect:/login");
  expect(mocks.get).not.toHaveBeenCalled();
});
it("denies foreign shops, missing shop scope and non-owner roles", async () => {
  for (const query of [{}, { shopId: "invalid" }, { shopId: clientId }]) await expect(Page(request(query))).rejects.toThrow("not-found");
  for (const role of ["BARBER", "RECEPTIONIST"]) {
    mocks.authenticate.mockResolvedValue({ ...principal, memberships: [{ barbershopId: shopId, role }] });
    await expect(Page(request())).rejects.toThrow("not-found");
  }
  expect(mocks.get).not.toHaveBeenCalled();
});
it("uses verified identity and returns not-found for absent or inaccessible clients", async () => {
  await expect(Page(request({ shopId, page: "2" }))).rejects.toThrow("not-found");
  expect(mocks.get).toHaveBeenCalledWith(principal, shopId, clientId, 2);
  mocks.get.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(Page(request())).rejects.toThrow("not-found");
});
it("normalizes malformed page inputs and preserves genuine database failures", async () => {
  for (const page of ["-1", "0", "1.5", "Infinity", "999999999999999999999999", "oops"]) {
    await expect(Page(request({ shopId, page }))).rejects.toThrow("not-found");
    expect(mocks.get).toHaveBeenLastCalledWith(principal, shopId, clientId, 1);
  }
  mocks.get.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(Page(request())).rejects.toThrow("database unavailable");
});

it("renders saved history in shop-local time with calendar and pagination links", async () => {
  mocks.get.mockResolvedValue({
    client: { name: "Sam", phone: "+96171123456", email: null, barbershop: { name: "Shop A" } },
    timeZone: "Asia/Beirut", total: 21, page: 1, pages: 2,
    appointments: [{ id: "saved", startsAt: new Date("2026-10-24T09:00Z"), serviceEndsAt: new Date("2026-10-24T09:30Z"),
      status: "CANCELLED", barber: { displayName: "Alex" }, services: [{ name: "Original cut", priceMinor: 1500, currency: "USD" }] }],
  });
  const html = renderToStaticMarkup(await Page(request()));
  for (const detail of ["Sam", "Shop A", "Original cut", "$15.00", "Cancelled", "GMT+3", "page=2", "date=2026-10-24"]) expect(html).toContain(detail);
});
