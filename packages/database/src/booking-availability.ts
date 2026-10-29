import type { StaffPrincipal } from "@barber/auth";
import { bookingCandidates, findAvailableSlots, validateBookingPolicy, type AvailableBarber, type BookingPolicy } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";
import { loadBookingSchedule } from "./booking-schedule";

export class BookingPolicyMissingError extends Error {}
export function createBookingAvailability(database: PrismaClient) {
  return {
    policy(principal: StaffPrincipal | null, shopId: string) {
      return withShopOwner(database, principal, shopId, async tx => {
        const policy = await tx.shopBookingPolicy.findUnique({ where: { barbershopId: shopId } });
        return policy ? validateBookingPolicy(policy as BookingPolicy) : null;
      });
    },
    savePolicy(principal: StaffPrincipal | null, shopId: string, input: BookingPolicy) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        const data = validateBookingPolicy(input);
        const before = await tx.shopBookingPolicy.findUnique({ where: { barbershopId: shopId } });
        await tx.shopBookingPolicy.upsert({ where: { barbershopId: shopId }, create: { barbershopId: shopId, ...data }, update: data });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "booking.policy_saved", details: { before: before ? { ...validateBookingPolicy(before as BookingPolicy) } : null, after: { ...data } } } });
      });
    },
    /** Owner-only read. A result is never a reservation or an authorization to book. */
    search(principal: StaffPrincipal | null, shopId: string, input: { date: string; serviceIds: string[]; barberId?: string }, now = new Date()) {
      return withShopOwner(database, principal, shopId, async (tx, shop) => {
        return searchBookingAvailability(tx, shopId, shop, input, now);
      });
    },
  };
}

/** Internal transaction helper shared by availability reads and booking revalidation.
 * Call only after acquiring withShopOwner's shop lock; all owner configuration writes
 * use that lock too, keeping catalog, policies and schedules stable until commit.
 */
export async function searchBookingAvailability(tx: Prisma.TransactionClient, shopId: string,
  shop: { currency: string | null; time_zone: string },
  input: { date: string; serviceIds: string[]; barberId?: string }, now: Date) {
  const stored = await tx.shopBookingPolicy.findUnique({ where: { barbershopId: shopId } });
  if (!stored) throw new BookingPolicyMissingError("Configure booking policies first");
  const policy = validateBookingPolicy(stored as BookingPolicy);
  if (!shop.currency) throw new Error("Shop currency required");
  if (!input.serviceIds.length || new Set(input.serviceIds).size !== input.serviceIds.length) throw new Error("Select unique services");
  const services = await tx.service.findMany({ where: { barbershopId: shopId, id: { in: input.serviceIds }, archivedAt: null } });
  if (services.length !== input.serviceIds.length) throw new Error("Service not found");
  const records = await tx.barber.findMany({ where: { barbershopId: shopId, ...(input.barberId ? { id: input.barberId } : {}) }, select: {
    id: true, barbershopId: true, displayName: true,
    services: { where: { serviceId: { in: input.serviceIds }, service: { archivedAt: null } }, select: { serviceId: true, durationMinutes: true, priceMinor: true } },
  } });
  if (input.barberId && !records.length) throw new Error("Barber not found");
  const candidates = bookingCandidates(input.date, shop.time_zone, policy, now.getTime());
  const barbers: AvailableBarber[] = [];
  const closures: { start: number; end: number }[] = [];
  for (const barber of candidates.length ? records : []) {
    if (barber.services.length !== services.length) continue;
    const duration = services.reduce((total, service) => total + (barber.services.find(option => option.serviceId === service.id)!.durationMinutes ?? service.durationMinutes), policy.bufferAfterMinutes);
    const schedule = await loadBookingSchedule(tx, { shopId, barberId: barber.id, timeZone: shop.time_zone, date: input.date, occupiedMinutes: duration, candidates });
    barbers.push({ id: barber.id, barbershopId: shopId, services: barber.services.map(option => ({ serviceId: option.serviceId, ...(option.durationMinutes === null ? {} : { durationMinutes: option.durationMinutes }), ...(option.priceMinor === null ? {} : { priceMinor: option.priceMinor }) })), working: schedule.working,
      unavailable: schedule.unavailable });
    closures.push(...schedule.closures);
  }
  const slots = !candidates.length ? [] : findAvailableSlots({ barbershopId: shopId, services, selectedServiceIds: input.serviceIds, barbers, candidateStarts: candidates,
    earliestStart: candidates[0]!, latestStart: candidates.at(-1)!, bufferAfterMinutes: policy.bufferAfterMinutes, closures });
  return { date: input.date, timeZone: shop.time_zone, currency: shop.currency, approvalMode: policy.approvalMode, checkedAt: now.toISOString(),
    services: services.map(service => ({ id: service.id, name: service.name })), slots: slots.map(slot => {
      const barber = records.find(barber => barber.id === slot.barberId)!;
      return { ...slot, barberName: barber.displayName, services: input.serviceIds.map((serviceId, position) => {
        const service = services.find(service => service.id === serviceId)!;
        const option = barber.services.find(option => option.serviceId === serviceId)!;
        return { serviceId, position, name: service.name, currency: service.currency,
          durationMinutes: option.durationMinutes ?? service.durationMinutes,
          priceMinor: option.priceMinor ?? service.priceMinor };
      }) };
    }) };
}
