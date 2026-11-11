import type { StaffPrincipal } from "@barber/auth";
import { walkInStarts } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { searchBookingAvailability } from "./booking-availability";
import { writeBooking } from "./booking-write";
import { isExclusionConflict, resolveBookingIdentity, SlotUnavailableError, type BookingIdentityInput } from "./bookings";
import { withShopOwner } from "./owner-transaction";
import { withStaffAccess, type StaffAccess } from "./staff-access";

export class WalkInQueueDisabledError extends Error {
  constructor() { super("Walk-in queue is turned off"); }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type WalkInInput = { serviceIds: string[]; barberId?: string } & BookingIdentityInput;
export type QueueEntryInput = { serviceIds: string[]; preferredBarberId?: string } &
  ({ clientId: string; guest?: never } | { clientId?: never; guest: { name: string; phone: string } });

function validServices(serviceIds: unknown): serviceIds is string[] {
  return Array.isArray(serviceIds) && serviceIds.length > 0 && serviceIds.length <= 20 && new Set(serviceIds).size === serviceIds.length &&
    serviceIds.every(id => typeof id === "string" && uuid.test(id));
}

/** Books the earliest start from now for the chosen (or any) barber; identity must already be resolved by the caller. */
async function bookWalkIn(tx: Prisma.TransactionClient, shopId: string, shop: { currency: string | null; time_zone: string }, actorUserId: string,
  access: StaffAccess, input: { serviceIds: string[]; barberId?: string }, identity: { clientId: string | null; guestName: string | null; guestPhone: string | null }, now: Date, queueEntryId?: string) {
  if (!validServices(input.serviceIds) || (input.barberId !== undefined && !uuid.test(input.barberId))) throw new Error("Invalid walk-in");
  if (access.barberId && input.barberId && input.barberId !== access.barberId) throw new Error("Forbidden");
  const barberId = access.barberId ?? input.barberId;
  const { date, starts } = walkInStarts(now.getTime(), shop.time_zone);
  const available = await searchBookingAvailability(tx, shopId, shop, { date, serviceIds: input.serviceIds, ...(barberId ? { barberId } : {}) }, now, starts);
  const slot = available.slots[0];
  if (!slot) throw new SlotUnavailableError();
  const appointment = await writeBooking(tx, shopId, slot, available.approvalMode, identity, true);
  await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "booking.walk_in_created",
    details: { appointmentId: appointment.id, clientId: identity.clientId, barberId: slot.barberId, startsAt: appointment.startsAt.toISOString(),
      occupiedUntil: appointment.occupiedUntil.toISOString(), currency: available.currency, totalPriceMinor: slot.totalPriceMinor, services: slot.services, ...(queueEntryId ? { queueEntryId } : {}) } } });
  return { appointment, barberName: slot.barberName, services: slot.services.map(service => service.name), totalPriceMinor: slot.totalPriceMinor, currency: available.currency, timeZone: available.timeZone };
}

/** Staff walk-ins and the optional shop waiting queue. Requires appointment permission; barbers are limited to themselves for bookings. */
export function createWalkIns(database: PrismaClient, clock: () => Date = () => new Date()) {
  async function guarded<T>(operation: () => Promise<T>) {
    try { return await operation(); } catch (error) {
      if (isExclusionConflict(error)) throw new SlotUnavailableError();
      throw error;
    }
  }
  return {
    create(principal: StaffPrincipal | null, shopId: string, input: WalkInInput) {
      return guarded(() => withStaffAccess(database, principal, shopId, "appointments", async (tx, shop, actorUserId, access) => {
        const identity = await resolveBookingIdentity(tx, shopId, actorUserId, input);
        const booked = await bookWalkIn(tx, shopId, shop, actorUserId, access, input, identity, clock());
        return { ...booked, clientName: identity.clientName };
      }));
    },
    queue(principal: StaffPrincipal | null, shopId: string) {
      return withStaffAccess(database, principal, shopId, "appointments", async tx => {
        const shop = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { walkInQueueEnabled: true } });
        const entries = await tx.walkInQueueEntry.findMany({ where: { barbershopId: shopId, status: "WAITING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, guestName: true, guestPhone: true, serviceIds: true, createdAt: true, client: { select: { name: true, phone: true } }, preferredBarber: { select: { id: true, displayName: true } } } });
        const services = await tx.service.findMany({ where: { barbershopId: shopId, id: { in: [...new Set(entries.flatMap(entry => entry.serviceIds))] } }, select: { id: true, name: true } });
        return { enabled: shop.walkInQueueEnabled, observedAt: clock().getTime(), entries: entries.map(entry => ({ ...entry, services: entry.serviceIds.map(id => services.find(service => service.id === id)?.name ?? "") })) };
      });
    },
    setQueueEnabled(principal: StaffPrincipal | null, shopId: string, enabled: boolean) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        if (typeof enabled !== "boolean") throw new Error("Invalid setting");
        const before = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { walkInQueueEnabled: true } });
        if (before.walkInQueueEnabled === enabled) return;
        await tx.barbershop.update({ where: { id: shopId }, data: { walkInQueueEnabled: enabled } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "shop.walk_in_queue_toggled", details: { enabled } } });
      });
    },
    enqueue(principal: StaffPrincipal | null, shopId: string, input: QueueEntryInput) {
      return withStaffAccess(database, principal, shopId, "appointments", async (tx, _shop, actorUserId) => {
        const shop = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { walkInQueueEnabled: true } });
        if (!shop.walkInQueueEnabled) throw new WalkInQueueDisabledError();
        if (!validServices(input.serviceIds) || (input.preferredBarberId !== undefined && !uuid.test(input.preferredBarberId))) throw new Error("Invalid queue entry");
        if (await tx.service.count({ where: { barbershopId: shopId, id: { in: input.serviceIds }, archivedAt: null } }) !== input.serviceIds.length) throw new Error("Service not found");
        if (input.preferredBarberId && !await tx.barber.findFirst({ where: { barbershopId: shopId, id: input.preferredBarberId, membership: { accessDisabledAt: null } }, select: { id: true } })) throw new Error("Barber not found");
        if ((input.clientId === undefined) === (input.guest === undefined)) throw new Error("Choose one queue identity");
        // Guests are never turned into client profiles here; staff register clients explicitly.
        const identity = input.clientId !== undefined ? await resolveBookingIdentity(tx, shopId, actorUserId, { clientId: input.clientId })
          : await resolveBookingIdentity(tx, shopId, actorUserId, { guest: input.guest! });
        const entry = await tx.walkInQueueEntry.create({ data: { barbershopId: shopId, clientId: identity.clientId, guestName: identity.guestName, guestPhone: identity.guestPhone,
          preferredBarberId: input.preferredBarberId ?? null, serviceIds: input.serviceIds } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "queue.joined", details: { entryId: entry.id, clientId: identity.clientId } } });
        return { id: entry.id };
      });
    },
    remove(principal: StaffPrincipal | null, shopId: string, entryId: string) {
      return withStaffAccess(database, principal, shopId, "appointments", async (tx, _shop, actorUserId) => {
        if (!uuid.test(entryId)) throw new Error("Invalid queue entry");
        const changed = await tx.walkInQueueEntry.updateMany({ where: { barbershopId: shopId, id: entryId, status: "WAITING" }, data: { status: "REMOVED", resolvedAt: clock() } });
        if (changed.count !== 1) throw new Error("Queue entry changed");
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "queue.removed", details: { entryId } } });
      });
    },
    /** Turns a waiting entry into a confirmed walk-in starting at the earliest free minute. */
    serve(principal: StaffPrincipal | null, shopId: string, entryId: string, barberId?: string) {
      return guarded(() => withStaffAccess(database, principal, shopId, "appointments", async (tx, shop, actorUserId, access) => {
        if (!uuid.test(entryId)) throw new Error("Invalid queue entry");
        const entry = await tx.walkInQueueEntry.findFirst({ where: { barbershopId: shopId, id: entryId, status: "WAITING" } });
        if (!entry) throw new Error("Queue entry changed");
        // A barber serving the queue always takes the client; others honor an explicit choice, then the preference.
        const chosen = access.barberId ?? barberId ?? entry.preferredBarberId ?? undefined;
        const now = clock();
        const booked = await bookWalkIn(tx, shopId, shop, actorUserId, access, { serviceIds: entry.serviceIds, ...(chosen ? { barberId: chosen } : {}) },
          { clientId: entry.clientId, guestName: entry.guestName, guestPhone: entry.guestPhone }, now, entry.id);
        const changed = await tx.walkInQueueEntry.updateMany({ where: { barbershopId: shopId, id: entryId, status: "WAITING" }, data: { status: "SERVED", resolvedAt: now, appointmentId: booked.appointment.id } });
        if (changed.count !== 1) throw new Error("Queue entry changed");
        return booked;
      }));
    },
  };
}
