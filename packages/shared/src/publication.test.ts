import { describe, expect, it } from "vitest";
import { publicationGaps, type PublicationSnapshot } from "./publication";

const ready: PublicationSnapshot = {
  name: "Royal Barber", slug: "royal-barber", phone: "+96170123456", address: "Hamra, Beirut", timeZone: "Asia/Beirut",
  currency: "USD", activeServiceCount: 2, bookableBarberCount: 1, hasBookingPolicy: true,
};

describe("publicationGaps", () => {
  it("accepts a fully configured shop", () => {
    expect(publicationGaps(ready)).toEqual([]);
  });

  it("lists every missing requirement in checklist order", () => {
    expect(publicationGaps({ ...ready, name: " ", phone: null, address: "  ", currency: null, activeServiceCount: 0, bookableBarberCount: 0, hasBookingPolicy: false }))
      .toEqual(["name", "phone", "address", "currency", "services", "barbers", "policy"]);
  });

  it("rejects reserved slugs and unknown time zones", () => {
    expect(publicationGaps({ ...ready, slug: "admin", timeZone: "Mars/Olympus" })).toEqual(["slug", "timeZone"]);
  });
});
