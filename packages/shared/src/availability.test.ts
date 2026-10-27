import { describe, expect, it } from "vitest";
import { findAvailableSlots, type AvailabilityRequest, type TimeInterval } from "./availability";

const at = (time: string) => Date.parse(`2026-07-01T${time}:00Z`);
const interval = (start: string, end: string): TimeInterval => ({ start: at(start), end: at(end) });
function request(): AvailabilityRequest {
  return {
    barbershopId: "shop-a",
    services: [
      { id: "cut", barbershopId: "shop-a", durationMinutes: 30, priceMinor: 1500 },
      { id: "beard", barbershopId: "shop-a", durationMinutes: 15, priceMinor: 500 },
    ],
    selectedServiceIds: ["cut"],
    barbers: [{ id: "barber-a", barbershopId: "shop-a", services: [{ serviceId: "cut" }, { serviceId: "beard" }], working: [interval("09:00", "12:00")], unavailable: [] }],
    candidateStarts: [at("09:00"), at("09:15"), at("09:30"), at("10:00"), at("11:30")],
    earliestStart: at("09:00"), latestStart: at("12:00"), bufferAfterMinutes: 0, closures: [],
  };
}
const starts = (input: AvailabilityRequest) => findAvailableSlots(input).map(slot => slot.start);

describe("duration-based availability", () => {
  it("combines services and applies the barber's duration and price overrides, including zero price", () => {
    const input = request();
    input.selectedServiceIds = ["cut", "beard"];
    input.barbers = [{ ...input.barbers[0]!, services: [{ serviceId: "cut", durationMinutes: 45, priceMinor: 0 }, { serviceId: "beard" }] }];
    expect(findAvailableSlots(input)[0]).toEqual({ barberId: "barber-a", start: at("09:00"), serviceEnd: at("10:00"), occupiedEnd: at("10:00"), durationMinutes: 60, totalPriceMinor: 500 });
    expect(starts(input)).not.toContain(at("11:30"));
  });
  it("requires the entire service and buffer to fit inside working time", () => {
    const input = request();
    expect(starts(input)).toContain(at("11:30"));
    input.bufferAfterMinutes = 1;
    expect(starts(input)).not.toContain(at("11:30"));
    expect(findAvailableSlots(input)[0]?.occupiedEnd).toBe(at("09:31"));
  });
  it("allows touching boundaries but blocks even a one-millisecond overlap", () => {
    const input = request();
    input.barbers = [{ ...input.barbers[0]!, unavailable: [interval("09:30", "10:00")] }];
    expect(starts(input)).toEqual([at("09:00"), at("10:00"), at("11:30")]);
    input.candidateStarts = [at("09:00") + 1, at("10:00") - 1];
    expect(starts(input)).toEqual([]);
  });
  it("blocks buffers overlapping an appointment, break or closure", () => {
    const input = request();
    input.bufferAfterMinutes = 15;
    input.closures = [interval("09:40", "10:00")];
    expect(starts(input)).toEqual([at("10:00")]);
  });
  it("merges adjacent/overlapping working periods, but never bridges a break", () => {
    const input = request();
    input.barbers = [{ ...input.barbers[0]!, working: [interval("09:15", "10:00"), interval("09:00", "09:20"), interval("10:30", "12:00")] }];
    expect(starts(input)).toEqual([at("09:00"), at("09:15"), at("09:30"), at("11:30")]);
  });
  it("honors exact inclusive start-policy bounds and deduplicates/sorts candidates", () => {
    const input = request();
    input.earliestStart = at("09:15"); input.latestStart = at("09:30");
    input.candidateStarts = [at("09:30"), at("09:00"), at("09:15"), at("09:30"), at("10:00")];
    expect(starts(input)).toEqual([at("09:15"), at("09:30")]);
  });
  it("returns no slots for an all-day closure or no working hours", () => {
    const input = request(); input.closures = [interval("00:00", "23:59")];
    expect(starts(input)).toEqual([]);
    input.closures = []; input.barbers = [{ ...input.barbers[0]!, working: [] }];
    expect(starts(input)).toEqual([]);
  });
  it("does not mutate schedules or candidate arrays", () => {
    const input = request(); const original = structuredClone(input);
    findAvailableSlots(input);
    expect(input).toEqual(original);
  });
});

describe("barber selection and tenant boundaries", () => {
  it("only offers barbers supporting every selected service", () => {
    const input = request(); input.selectedServiceIds = ["cut", "beard"];
    input.barbers = [input.barbers[0]!, { ...input.barbers[0]!, id: "barber-b", services: [{ serviceId: "cut" }] }];
    expect(new Set(findAvailableSlots(input).map(slot => slot.barberId))).toEqual(new Set(["barber-a"]));
    input.barberId = "barber-b"; expect(starts(input)).toEqual([]);
  });
  it("keeps same-time choices for each available barber and honors a specific barber", () => {
    const input = request(); input.candidateStarts = [at("09:00")];
    input.barbers = [{ ...input.barbers[0]!, id: "barber-b" }, input.barbers[0]!];
    expect(findAvailableSlots(input).map(slot => slot.barberId)).toEqual(["barber-a", "barber-b"]);
    input.barberId = "barber-b";
    expect(findAvailableSlots(input).map(slot => slot.barberId)).toEqual(["barber-b"]);
  });
  it("rejects cross-shop services even when they are not selected", () => {
    const input = request(); input.services = [...input.services, { ...input.services[0]!, id: "foreign", barbershopId: "shop-b" }];
    expect(() => findAvailableSlots(input)).toThrow("Cross-shop service");
  });
  it("rejects cross-shop barbers even when they are not selected", () => {
    const input = request(); input.barberId = "barber-a";
    input.barbers = [...input.barbers, { ...input.barbers[0]!, id: "foreign", barbershopId: "shop-b" }];
    expect(() => findAvailableSlots(input)).toThrow("Cross-shop barber");
  });
});

describe("invalid availability inputs", () => {
  it.each([{ selectedServiceIds: [] }, { selectedServiceIds: ["cut", "cut"] }, { selectedServiceIds: ["unknown"] }])("rejects empty, duplicate or unknown selection $selectedServiceIds", ({ selectedServiceIds }) => {
    expect(() => findAvailableSlots({ ...request(), selectedServiceIds })).toThrow();
  });
  it.each([NaN, Infinity, -1, 0, 1.5])("rejects invalid service duration %s", durationMinutes => {
    const input = request(); input.services = [{ ...input.services[0]!, durationMinutes }];
    expect(() => findAvailableSlots(input)).toThrow();
  });
  it("rejects invalid timestamps, reversed intervals and missing barbers", () => {
    expect(() => findAvailableSlots({ ...request(), candidateStarts: [NaN] })).toThrow("UTC instant");
    expect(() => findAvailableSlots({ ...request(), closures: [interval("10:00", "09:00")] })).toThrow("Interval");
    expect(() => findAvailableSlots({ ...request(), barberId: "unknown" })).toThrow("Unknown barber");
  });
  it("rejects fractional prices and numeric overflow", () => {
    const input = request(); input.services = [{ ...input.services[0]!, priceMinor: 1.5 }];
    expect(() => findAvailableSlots(input)).toThrow("price");
    input.services = request().services.map(service => ({ ...service, priceMinor: Number.MAX_SAFE_INTEGER }));
    input.selectedServiceIds = ["cut", "beard"];
    expect(() => findAvailableSlots(input)).toThrow("total price");
  });
});

it("measures elapsed service time across the Beirut spring DST jump using UTC instants", () => {
  const input = request();
  const start = Date.parse("2026-03-28T23:30:00+02:00");
  const end = Date.parse("2026-03-29T01:30:00+03:00");
  input.services = [{ ...input.services[0]!, durationMinutes: 60 }];
  input.barbers = [{ ...input.barbers[0]!, services: [{ serviceId: "cut" }], working: [{ start, end }] }];
  input.candidateStarts = [start]; input.earliestStart = start; input.latestStart = end;
  expect(findAvailableSlots(input)[0]?.serviceEnd).toBe(end);
});
