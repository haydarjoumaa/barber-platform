import { describe, expect, it } from "vitest";
import { walkInStarts } from "./walk-in";

describe("walkInStarts", () => {
  it("rounds up to the next minute and stops at shop-local midnight", () => {
    // 23:57:30 Beirut (UTC+3 in July).
    const { date, starts } = walkInStarts(Date.parse("2026-07-01T20:57:30Z"), "Asia/Beirut");
    expect(date).toBe("2026-07-01");
    expect(starts.map(start => new Date(start).toISOString())).toEqual(["2026-07-01T20:58:00.000Z", "2026-07-01T20:59:00.000Z"]);
  });

  it("keeps an exact minute and covers a 23-hour DST day", () => {
    // Beirut springs forward at midnight on the last Sunday of March 2026 (March 29), so that day has 23 hours.
    const { date, starts } = walkInStarts(Date.parse("2026-03-28T22:00:00Z"), "Asia/Beirut");
    expect(date).toBe("2026-03-29");
    expect(starts[0]).toBe(Date.parse("2026-03-28T22:00:00Z"));
    expect(starts).toHaveLength(23 * 60);
  });
});
