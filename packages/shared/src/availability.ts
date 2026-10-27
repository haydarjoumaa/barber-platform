/** Pure domain calculations. Inputs must be loaded and authorized by the server. */
export interface TimeInterval {
  /** UTC epoch milliseconds; intervals are half-open: [start, end). */
  start: number;
  end: number;
}

export interface BookingService {
  id: string;
  barbershopId: string;
  durationMinutes: number;
  /** Integer currency minor units, in the shop's currency. */
  priceMinor: number;
}

export interface BarberServiceOption {
  serviceId: string;
  durationMinutes?: number;
  priceMinor?: number;
}

export interface AvailableBarber {
  id: string;
  barbershopId: string;
  /** Explicit supported services; absence means the barber cannot perform it. */
  services: readonly BarberServiceOption[];
  /** Resolved UTC working intervals, after temporary schedule changes. */
  working: readonly TimeInterval[];
  /** Breaks, time off and blocking appointments, including their occupied buffers. */
  unavailable: readonly TimeInterval[];
}

export interface AvailabilityRequest {
  barbershopId: string;
  services: readonly BookingService[];
  selectedServiceIds: readonly string[];
  barbers: readonly AvailableBarber[];
  /** Omit to consider all eligible barbers. */
  barberId?: string;
  /** Supplied by the schedule layer; no slot cadence or wall-clock rounding is assumed. */
  candidateStarts: readonly number[];
  /** Inclusive bounds for appointment starts, resolved from booking policies by the caller. */
  earliestStart: number;
  latestStart: number;
  /** Occupied time after service ends, supplied explicitly by the shop policy layer. */
  bufferAfterMinutes: number;
  closures: readonly TimeInterval[];
}

export interface AvailableSlot {
  barberId: string;
  start: number;
  serviceEnd: number;
  occupiedEnd: number;
  durationMinutes: number;
  totalPriceMinor: number;
}

const MINUTE = 60_000;
function integer(value: number, minimum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${label}`);
}
function instant(value: number) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 8_640_000_000_000_000) throw new Error("Invalid UTC instant");
}
function validateInterval(interval: TimeInterval) {
  instant(interval.start);
  instant(interval.end);
  if (interval.end <= interval.start) throw new Error("Interval end must follow start");
}
function uniqueIds(ids: readonly string[], label: string) {
  if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) throw new Error(`Invalid or duplicate ${label}`);
}
function overlaps(a: TimeInterval, b: TimeInterval) {
  return a.start < b.end && b.start < a.end;
}

/** Merge overlapping/adjacent working periods without mutating the input. */
function mergeWorking(intervals: readonly TimeInterval[]): TimeInterval[] {
  const merged: TimeInterval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

/**
 * Returns sorted slots per barber. It neither reserves a slot nor proves it will
 * still be available later. Booking writes must revalidate inside a transaction
 * protected by a PostgreSQL overlap constraint.
 */
export function findAvailableSlots(request: AvailabilityRequest): AvailableSlot[] {
  if (!request.barbershopId.trim()) throw new Error("Shop context is required");
  instant(request.earliestStart);
  instant(request.latestStart);
  if (request.latestStart < request.earliestStart) throw new Error("Invalid start bounds");
  integer(request.bufferAfterMinutes, 0, "buffer duration");
  uniqueIds(request.services.map(service => service.id), "service IDs");
  uniqueIds(request.barbers.map(barber => barber.id), "barber IDs");
  uniqueIds(request.selectedServiceIds, "selected service IDs");
  if (!request.selectedServiceIds.length) throw new Error("Select at least one service");
  const catalog = new Map(request.services.map(service => [service.id, service]));
  for (const service of request.services) {
    if (service.barbershopId !== request.barbershopId) throw new Error("Cross-shop service");
    integer(service.durationMinutes, 1, "service duration");
    integer(service.priceMinor, 0, "service price");
  }
  const selected = request.selectedServiceIds.map(id => {
    const service = catalog.get(id);
    if (!service) throw new Error("Unknown selected service");
    return service;
  });
  // Validate every record, including barbers excluded by a specific selection.
  for (const barber of request.barbers) {
    if (barber.barbershopId !== request.barbershopId) throw new Error("Cross-shop barber");
    uniqueIds(barber.services.map(option => option.serviceId), "barber service IDs");
    for (const option of barber.services) {
      if (!catalog.has(option.serviceId)) throw new Error("Unknown barber service");
      if (option.durationMinutes !== undefined) integer(option.durationMinutes, 1, "barber service duration");
      if (option.priceMinor !== undefined) integer(option.priceMinor, 0, "barber service price");
    }
    barber.working.forEach(validateInterval);
    barber.unavailable.forEach(validateInterval);
  }
  request.closures.forEach(validateInterval);
  request.candidateStarts.forEach(instant);
  if (request.barberId !== undefined && !request.barbers.some(barber => barber.id === request.barberId)) throw new Error("Unknown barber");
  const starts = [...new Set(request.candidateStarts)].filter(start => start >= request.earliestStart && start <= request.latestStart).sort((a, b) => a - b);
  const slots: AvailableSlot[] = [];
  for (const barber of request.barbers) {
    if (request.barberId !== undefined && barber.id !== request.barberId) continue;
    const supported = new Map(barber.services.map(option => [option.serviceId, option]));
    if (selected.some(service => !supported.has(service.id))) continue;
    let durationMinutes = 0;
    let totalPriceMinor = 0;
    for (const service of selected) {
      const option = supported.get(service.id)!;
      durationMinutes += option.durationMinutes ?? service.durationMinutes;
      totalPriceMinor += option.priceMinor ?? service.priceMinor;
    }
    integer(durationMinutes, 1, "total duration");
    integer(totalPriceMinor, 0, "total price");
    const working = mergeWorking(barber.working);
    const blocked = [...barber.unavailable, ...request.closures];
    for (const start of starts) {
      const serviceEnd = start + durationMinutes * MINUTE;
      const occupiedEnd = serviceEnd + request.bufferAfterMinutes * MINUTE;
      instant(serviceEnd);
      instant(occupiedEnd);
      const occupied = { start, end: occupiedEnd };
      if (!working.some(period => period.start <= start && period.end >= occupiedEnd)) continue;
      if (blocked.some(period => overlaps(occupied, period))) continue;
      slots.push({ barberId: barber.id, start, serviceEnd, occupiedEnd, durationMinutes, totalPriceMinor });
    }
  }
  return slots.sort((a, b) => a.start - b.start || (a.barberId < b.barberId ? -1 : a.barberId > b.barberId ? 1 : 0));
}
