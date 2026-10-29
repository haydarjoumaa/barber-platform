import { describe, expect, it } from "vitest";
import { assertAccountOrigin, staffAccountConfig } from "./account-policy";

describe("staff account request policy", () => {
  it("requires an explicit origin", () => {
    expect(() => staffAccountConfig(undefined)).toThrow("APP_ORIGIN is required");
  });
  it.each(["http://localhost:3001", "http://127.0.0.1:3001", "http://[::1]:3001"])("allows local HTTP at %s", origin => {
    expect(staffAccountConfig(origin)).toEqual({ origin, secure: false, cookieName: "barber-staff-local" });
  });
  it("requires the secure host-only cookie name on HTTPS", () => {
    expect(staffAccountConfig("https://barber.example")).toEqual({ origin: "https://barber.example", secure: true, cookieName: "__Host-barber-staff" });
  });
  it.each([
    "http://barber.example", "http://localhost.attacker.example", "http://192.168.1.10",
    "https://barber.example/", "https://barber.example/business", "https://barber.example?x=1",
    "https://barber.example#fragment", "https://user:password@barber.example", "file:///tmp", "invalid",
  ])("rejects unsafe or noncanonical configuration %s", origin => {
    expect(() => staffAccountConfig(origin)).toThrow();
  });
  it("accepts only the exact configured request origin", () => {
    const expected = "https://barber.example";
    expect(() => assertAccountOrigin(expected, expected)).not.toThrow();
    for (const actual of [null, "null", "", "http://barber.example", "https://barber.example:444", "https://barber.example.attacker.example", "https://attacker.example"]) {
      expect(() => assertAccountOrigin(actual, expected)).toThrow("Invalid request origin");
    }
  });
});
