import { describe, expect, it } from "vitest";
import { parsePriceMinor, priceInputValue } from "./money";

describe("currency amounts", () => {
  it.each([
    ["19.99", "USD", 1999], ["0.29", "USD", 29], ["0", "USD", 0],
    ["1500", "JPY", 1500], ["1.234", "KWD", 1234], ["١٢٫٥٠", "USD", 1250],
    ["۱۲.۵۰", "USD", 1250], ["21474836.47", "USD", 2147483647],
  ])("converts %s %s exactly", (input, currency, minor) => {
    expect(parsePriceMinor(input, currency)).toBe(minor);
    expect(parsePriceMinor(priceInputValue(minor, currency), currency)).toBe(minor);
  });
  it.each(["", "-1", "+1", "1e2", "0x10", "1,000", "1,5", "1.001", "NaN", "Infinity", ".5", "1.", "21474836.48", "9".repeat(100)])("rejects invalid USD amount %s", value => {
    expect(() => parsePriceMinor(value, "USD")).toThrow();
  });
  it("rejects fractional yen and unknown currency", () => {
    expect(() => parsePriceMinor("1.1", "JPY")).toThrow();
    expect(() => parsePriceMinor("1", "ZZZ")).toThrow();
  });
  it("renders input precision without grouping or floating point arithmetic", () => {
    expect(priceInputValue(5, "USD")).toBe("0.05");
    expect(priceInputValue(5, "KWD")).toBe("0.005");
    expect(priceInputValue(5, "JPY")).toBe("5");
  });
});
