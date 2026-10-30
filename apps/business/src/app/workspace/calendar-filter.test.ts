import { expect, it } from "vitest";
import { calendarFilterLink, filterAppointments } from "./calendar-filter";

const rows = [
  { id: "one", status: "CONFIRMED", client: { name: "Sam", phone: "+96171123456" }, guestName: null, guestPhone: null, barber: { displayName: "Alex" } },
  { id: "two", status: "PENDING", client: null, guestName: "كريم", guestPhone: "+96170987654", barber: { displayName: "Jo" } },
];
it("searches registered clients, guests, phones and barbers", () => {
  for (const query of [" SAM ", "71123456", "alex"]) expect(filterAppointments(rows, query).map(row => row.id)).toEqual(["one"]);
  for (const query of ["كريم", "70987654", "jo"]) expect(filterAppointments(rows, query).map(row => row.id)).toEqual(["two"]);
});
it("combines status and search without mutating the source", () => {
  expect(filterAppointments(rows, "Sam", "PENDING")).toEqual([]);
  expect(filterAppointments(rows, "", "PENDING")).toEqual([rows[1]]);
  expect(filterAppointments(rows, "", "invalid")).toEqual(rows);
  expect(filterAppointments(rows)).toEqual(rows);
  expect(rows).toHaveLength(2);
});
it("preserves filters in encoded calendar links without injecting parameters", () => {
  const url = new URL(calendarFilterLink("2026-10-30", "month", "shop", "كريم&status=CANCELLED", "PENDING"), "https://example.invalid");
  expect(url.searchParams.get("search")).toBe("كريم&status=CANCELLED");
  expect(url.searchParams.getAll("status")).toEqual(["PENDING"]);
  expect(url.searchParams.get("view")).toBe("month");
  expect(url.hash).toBe("#appointments-shop");
});
