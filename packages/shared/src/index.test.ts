import { describe, expect, it } from "vitest";
import { formatShopDateTime, isValidShopSlug, localeDirection, RESERVED_SHOP_SLUGS } from "./index";

describe("shop slugs", () => {
  it("accepts canonical shop links", () => expect(isValidShopSlug("royal-barber")).toBe(true));
  it.each([...RESERVED_SHOP_SLUGS, "Royal", "a/b", "-shop", "shop-", "a--b", "ab", "a".repeat(64), "_next", "favicon.ico"])("rejects %s", slug => expect(isValidShopSlug(slug)).toBe(false));
});
describe("localization foundation", () => {
  it("supports both layout directions", () => { expect(localeDirection("ar")).toBe("rtl"); expect(localeDirection("en")).toBe("ltr"); });
  it("uses Beirut winter and summer offsets", () => {
    expect(formatShopDateTime(new Date("2026-01-15T10:00:00Z"))).toContain("12:00");
    expect(formatShopDateTime(new Date("2026-07-15T10:00:00Z"))).toContain("1:00");
  });
  it("crosses the Beirut DST transition without using a fixed offset", () => {
    expect(formatShopDateTime(new Date("2026-03-28T21:30:00Z"))).toContain("11:30");
    expect(formatShopDateTime(new Date("2026-03-28T22:30:00Z"))).toContain("1:30");
  });
});
