import { expect, it } from "vitest";
import { requireShopOwner } from "./index";

it("denies unauthenticated requests", () => expect(() => requireShopOwner(null, "shop-a")).toThrow("Forbidden"));
it("does not transfer owner access between shops", () => {
  const principal = { userId: "u", memberships: [{ barbershopId: "shop-a", role: "OWNER" as const }] };
  expect(() => requireShopOwner(principal, "shop-a")).not.toThrow();
  expect(() => requireShopOwner(principal, "shop-b")).toThrow("Forbidden");
});
it.each(["BARBER", "RECEPTIONIST"] as const)("denies owner operations to %s", role => {
  expect(() => requireShopOwner({ userId: "u", memberships: [{ barbershopId: "shop-a", role }] }, "shop-a")).toThrow("Forbidden");
});
