import { describe, expect, it } from "vitest";
import { appointmentMessage, whatsappLink, type AppointmentMessageInput } from "./appointment-message";

const booking: AppointmentMessageInput = {
  shopName: "Cuts & Co", clientName: "Sam", barberName: "Alex",
  startsAt: new Date("2026-10-24T09:00:00Z"), timeZone: "Asia/Beirut", status: "PENDING",
  services: [{ name: "Cut", priceMinor: 1250, currency: "USD" }, { name: "Beard", priceMinor: 575, currency: "USD" }],
};

describe("manual appointment messages", () => {
  it("encodes multilingual text without turning message content into URL parameters", () => {
    const text = "موعد & name=other? #\nhttps://example.com";
    const url = new URL(whatsappLink("+96171123456", text)!);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/96171123456");
    expect([...url.searchParams]).toEqual([["text", text]]);
    expect(url.hash).toBe("");
  });
  it.each([null, undefined, "", "071123456", "+012345678", "+961 71123456", "+96171123456?text=bad", "+1234567890123456"])("rejects ambiguous or malformed recipient %s", phone => {
    expect(whatsappLink(phone, "hello")).toBeNull();
  });
  it("includes saved services and total without falsely confirming a pending booking", () => {
    const text = appointmentMessage(booking, "en");
    for (const detail of ["Cuts & Co", "Sam", "Alex", "Cut · Beard", "$18.25", "Status: Pending"]) expect(text).toContain(detail);
    expect(text).not.toContain("Confirmed");
  });
  it.each([
    ["CONFIRMED", "Confirmed", "مؤكد"], ["CANCELLED", "Cancelled", "ملغى"],
    ["COMPLETED", "Completed", "مكتمل"], ["NO_SHOW", "No-show", "لم يحضر"],
  ] as const)("reports %s faithfully in both languages", (status, english, arabic) => {
    expect(appointmentMessage({ ...booking, status }, "en")).toContain(`Status: ${english}`);
    expect(appointmentMessage({ ...booking, status }, "ar")).toContain(`الحالة: ${arabic}`);
  });
  it("uses Beirut offsets on both sides of the autumn DST change", () => {
    expect(appointmentMessage(booking, "en")).toContain("GMT+3");
    expect(appointmentMessage({ ...booking, startsAt: new Date("2026-10-26T09:00:00Z") }, "en")).toContain("GMT+2");
  });
  it("does not invent totals for legacy or inconsistent snapshots", () => {
    expect(appointmentMessage({ ...booking, services: [] }, "en")).not.toContain("Total:");
    expect(appointmentMessage({ ...booking, services: [...booking.services, { name: "Other", priceMinor: 1, currency: "EUR" }] }, "en")).not.toContain("Total:");
  });
  it("respects zero-decimal currency totals", () => {
    expect(appointmentMessage({ ...booking, services: [{ name: "Cut", priceMinor: 2500, currency: "JPY" }] }, "en")).toContain("¥2,500");
  });
});
