import type { StaffPrincipal } from "@barber/auth";
import { calendarRange, type CalendarView } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { searchBookingAvailability } from "./booking-availability";
import { writeBooking } from "./booking-write";
import { moveAppointment, rescheduleStarts, reschedulingDeadlinePassed, reschedulingPolicy, ReschedulingDeadlineError } from "./booking-reschedule";
import { withStaffAccess, type StaffAccess } from "./staff-access";
import { withShopOwner } from "./owner-transaction";

export class SlotUnavailableError extends Error {
  constructor() { super("Slot unavailable; search again for alternatives"); }
}

export class CancellationDeadlineError extends Error {
  constructor() { super("Cancellation deadline passed"); }
}

export class ClientPhoneExistsError extends Error {
  constructor() { super("Select the existing client for this phone number"); }
}

/** Exactly one: an existing shop client, a guest contact stored on the appointment, or a new client profile. */
export type BookingIdentityInput = { clientId: string; guest?: never; newClient?: never }
  | { clientId?: never; guest: { name: string; phone: string }; newClient?: never }
  | { clientId?: never; guest?: never; newClient: { name: string; phone: string } };

export type OwnerBookingInput = {
  barberId: string;
  serviceIds: string[];
  /** Shop-local date from the availability result. */
  date: string;
  /** Exact UTC instant from the availability result, including DST occurrence. */
  startsAt: number;
} & BookingIdentityInput;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isExclusionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("meta" in error)) return false;
  const meta = error.meta as { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  return meta?.driverAdapterError?.cause?.originalCode === "23P01";
}

/** Resolves and validates the booking identity inside the caller's shop transaction; may register a new client. */
export async function resolveBookingIdentity(tx: Prisma.TransactionClient, shopId: string, actorUserId: string, input: BookingIdentityInput) {
  const identityCount = [input.clientId, input.guest, input.newClient].filter(value => value !== undefined).length;
  if (identityCount !== 1) throw new Error("Choose one booking identity");
  let clientId: string | null = null, clientName = "", guestName: string | null = null, guestPhone: string | null = null;
  if (input.clientId !== undefined) {
    if (!uuid.test(input.clientId)) throw new Error("Invalid client");
    const client = await tx.client.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id: input.clientId } } });
    if (!client) throw new Error("Client not found");
    clientId = client.id; clientName = client.name;
  } else {
    const contact = input.guest ?? input.newClient;
    if (!contact || typeof contact.name !== "string" || typeof contact.phone !== "string") throw new Error("Invalid contact");
    const name = contact.name.trim(), phone = contact.phone.trim();
    if (!name || name.length > 100 || (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) || (input.newClient && !phone)) throw new Error("Invalid contact");
    clientName = name;
    if (input.guest) { guestName = name; guestPhone = phone || null; }
    else {
      const existing = await tx.client.findUnique({ where: { barbershopId_phone: { barbershopId: shopId, phone } } });
      if (existing) throw new ClientPhoneExistsError();
      const client = await tx.client.create({ data: { barbershopId: shopId, name, phone } });
      clientId = client.id;
      await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "client.registered", details: { clientId } } });
    }
  }
  return { clientId, clientName, guestName, guestPhone };
}

/** Loads an upcoming pending/confirmed appointment visible to this staff member; barbers only see their own. */
async function movable(tx: Prisma.TransactionClient, shopId: string, appointmentId: string, access: StaffAccess) {
  if (!uuid.test(appointmentId)) throw new Error("Invalid appointment");
  const appointment = await tx.appointment.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id: appointmentId } } });
  if (!appointment || (access.barberId && appointment.barberId !== access.barberId) || !["PENDING", "CONFIRMED"].includes(appointment.status)) throw new Error("Appointment changed");
  return appointment;
}

/** Server repository only. Principals must come from verified sessions.
 * The clock is injected at construction for deterministic integration tests, never
 * supplied by request data. No policy overrides or guest accounts are inferred.
 */
export function createOwnerBookings(database: PrismaClient, clock: () => Date = () => new Date()) {
  function withBookings<T>(principal: StaffPrincipal | null, shopId: string, operation: (tx: Prisma.TransactionClient, shop: { currency: string | null; time_zone: string }, actor: string, access: StaffAccess) => Promise<T>) {
    return withStaffAccess(database, principal, shopId, "appointments", operation);
  }
  function calendar(principal: StaffPrincipal | null, shopId: string, date: string, view: CalendarView) {
    return withBookings(principal, shopId, async (tx, shop, _actor, access) => {
      const range = calendarRange(date, view, shop.time_zone);
      const appointments = await tx.appointment.findMany({
        where: { barbershopId: shopId, ...(access.barberId ? { barberId: access.barberId } : {}), startsAt: { lt: new Date(range.end) }, occupiedUntil: { gt: new Date(range.start) } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: { id: true, startsAt: true, serviceEndsAt: true, occupiedUntil: true, status: true, walkIn: true, guestName: true, guestPhone: true,
          client: { select: { id: true, name: true, phone: true } }, barber: { select: { displayName: true } },
          payments: { where: { voidedAt: null }, select: { id: true, amountMinor: true, currency: true, createdAt: true } },
          services: { orderBy: { position: "asc" }, select: { name: true, priceMinor: true, currency: true } } },
      });
      return { date, view, days: range.days, timeZone: shop.time_zone, appointments, observedAt: clock().getTime() };
    });
  }
  return {
    calendar,
    catalog(principal: StaffPrincipal | null, shopId: string) {
      return withBookings(principal, shopId, async (tx, _shop, _actor, access) => ({
        services: await tx.service.findMany({ where: { barbershopId: shopId, archivedAt: null }, select: { id: true, name: true } }),
        barbers: await tx.barber.findMany({ where: { barbershopId: shopId, membership: { accessDisabledAt: null }, ...(access.barberId ? { id: access.barberId } : {}) }, select: { id: true, displayName: true } }),
      }));
    },
    correctOutcome(principal: StaffPrincipal | null, shopId: string, appointmentId: string,
      input: { expectedStatus: "COMPLETED" | "NO_SHOW"; outcome: "COMPLETED" | "NO_SHOW"; reason: string }) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        if (!uuid.test(appointmentId) || !["COMPLETED", "NO_SHOW"].includes(input.expectedStatus) || !["COMPLETED", "NO_SHOW"].includes(input.outcome) ||
          input.expectedStatus === input.outcome || typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 500) throw new Error("Invalid outcome correction");
        const changed = await tx.appointment.updateMany({ where: { barbershopId: shopId, id: appointmentId, status: input.expectedStatus }, data: { status: input.outcome } });
        if (changed.count !== 1) throw new Error("Appointment changed");
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "booking.outcome_corrected", details: { appointmentId, previousStatus: input.expectedStatus, status: input.outcome, reason: input.reason.trim() } } });
      });
    },
    recordOutcome(principal: StaffPrincipal | null, shopId: string, appointmentId: string,
      input: { expectedStatus: "PENDING" | "CONFIRMED"; outcome: "COMPLETED" | "NO_SHOW" }) {
      return withBookings(principal, shopId, async (tx, _shop, actorUserId, access) => {
        if (!uuid.test(appointmentId) || !["PENDING", "CONFIRMED"].includes(input.expectedStatus) || !["COMPLETED", "NO_SHOW"].includes(input.outcome)) throw new Error("Invalid appointment outcome");
        // Staff explicitly record the outcome; never infer attendance or payment from time.
        const changed = await tx.appointment.updateMany({
          where: { id: appointmentId, barbershopId: shopId, ...(access.barberId ? { barberId: access.barberId } : {}), status: input.expectedStatus },
          data: { status: input.outcome },
        });
        if (changed.count !== 1) throw new Error("Appointment changed");
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId,
          event: input.outcome === "COMPLETED" ? "booking.completed" : "booking.no_show",
          details: { appointmentId, previousStatus: input.expectedStatus, status: input.outcome },
        } });
      });
    },
    cancel(principal: StaffPrincipal | null, shopId: string, appointmentId: string,
      input: { expectedStatus: "PENDING" | "CONFIRMED"; overrideDeadline: boolean }) {
      return withBookings(principal, shopId, async (tx, _shop, actorUserId, access) => {
        if (!uuid.test(appointmentId) || !["PENDING", "CONFIRMED"].includes(input.expectedStatus) || typeof input.overrideDeadline !== "boolean") throw new Error("Invalid cancellation");
        const appointment = await tx.appointment.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id: appointmentId } } });
        if (!appointment || (access.barberId && appointment.barberId !== access.barberId) || appointment.status !== input.expectedStatus) throw new Error("Appointment changed");
        if (input.overrideDeadline && !access.owner) throw new Error("Forbidden");
        const policy = await tx.shopBookingPolicy.findUnique({ where: { barbershopId: shopId } });
        if (!policy) throw new Error("Booking policy missing");
        const checkedAt = clock();
        if (!Number.isFinite(checkedAt.getTime())) throw new Error("Invalid clock");
        const deadline = appointment.startsAt.getTime() - policy.cancellationNoticeMinutes * 60_000;
        const deadlinePassed = checkedAt.getTime() > deadline;
        if (deadlinePassed && !input.overrideDeadline) throw new CancellationDeadlineError();
        const changed = await tx.appointment.updateMany({
          where: { id: appointmentId, barbershopId: shopId, ...(access.barberId ? { barberId: access.barberId } : {}), status: input.expectedStatus, startsAt: appointment.startsAt },
          data: { status: "CANCELLED" },
        });
        if (changed.count !== 1) throw new Error("Appointment changed");
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "booking.cancelled",
          details: { appointmentId, previousStatus: appointment.status, status: "CANCELLED", cancellationNoticeMinutes: policy.cancellationNoticeMinutes,
            checkedAt: checkedAt.toISOString(), deadlineOverridden: deadlinePassed && input.overrideDeadline },
        } });
      });
    },
    /** Open starts for moving an appointment on one shop-local date; read-only, never a reservation. */
    rescheduleOptions(principal: StaffPrincipal | null, shopId: string, appointmentId: string, date: string) {
      return withBookings(principal, shopId, async (tx, shop, _actor, access) => {
        const appointment = await movable(tx, shopId, appointmentId, access);
        const policy = await reschedulingPolicy(tx, shopId);
        const now = clock();
        return { date, timeZone: shop.time_zone, deadlinePassed: reschedulingDeadlinePassed(appointment, policy, now),
          starts: await rescheduleStarts(tx, shopId, shop.time_zone, appointment, policy, date, now) };
      });
    },
    async reschedule(principal: StaffPrincipal | null, shopId: string, appointmentId: string,
      input: { expectedStartsAt: string; date: string; startsAt: number; overrideDeadline: boolean }) {
      try {
        return await withBookings(principal, shopId, async (tx, shop, actorUserId, access) => {
          if (typeof input.overrideDeadline !== "boolean") throw new Error("Invalid reschedule");
          if (input.overrideDeadline && !access.owner) throw new Error("Forbidden");
          const appointment = await movable(tx, shopId, appointmentId, access);
          if (appointment.startsAt.toISOString() !== input.expectedStartsAt) throw new Error("Appointment changed");
          const policy = await reschedulingPolicy(tx, shopId);
          const checkedAt = clock();
          const deadlinePassed = reschedulingDeadlinePassed(appointment, policy, checkedAt);
          if (deadlinePassed && !input.overrideDeadline) throw new ReschedulingDeadlineError();
          // Staff moves keep the current approval status.
          const moved = await moveAppointment(tx, shopId, shop.time_zone, appointment, policy, { date: input.date, startsAt: input.startsAt, status: appointment.status as "PENDING" | "CONFIRMED" }, checkedAt);
          if (!moved) throw new SlotUnavailableError();
          await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "booking.rescheduled",
            details: { appointmentId, ...moved, reschedulingNoticeMinutes: policy.reschedulingNoticeMinutes, checkedAt: checkedAt.toISOString(), deadlineOverridden: deadlinePassed && input.overrideDeadline } } });
          return moved;
        });
      } catch (error) {
        if (isExclusionConflict(error)) throw new SlotUnavailableError();
        throw error;
      }
    },
    confirm(principal: StaffPrincipal | null, shopId: string, appointmentId: string) {
      return withBookings(principal, shopId, async (tx, _shop, actorUserId, access) => {
        if (!uuid.test(appointmentId)) throw new Error("Invalid appointment");
        // Compare and update atomically: stale forms cannot revive cancelled bookings.
        const changed = await tx.appointment.updateMany({
          where: { id: appointmentId, barbershopId: shopId, ...(access.barberId ? { barberId: access.barberId } : {}), status: "PENDING" },
          data: { status: "CONFIRMED" },
        });
        if (changed.count !== 1) throw new Error("Pending appointment not found");
        await tx.auditEvent.create({ data: {
          barbershopId: shopId, actorUserId, event: "booking.confirmed",
          details: { appointmentId, previousStatus: "PENDING", status: "CONFIRMED" },
        } });
      });
    },
    clients(principal: StaffPrincipal | null, shopId: string) {
      return withBookings(principal, shopId, tx => tx.client.findMany({
        where: { barbershopId: shopId }, select: { id: true, name: true, phone: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
      }));
    },
    registerClient(principal: StaffPrincipal | null, shopId: string, input: { name: string; phone: string }) {
      return withBookings(principal, shopId, async (tx, _shop, actorUserId) => {
        const name = input.name.trim(), phone = input.phone.trim();
        // Require an explicit international number; never guess the country code.
        if (!name || name.length > 100 || !/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Invalid client");
        const client = await tx.client.create({ data: { barbershopId: shopId, name, phone } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "client.registered", details: { clientId: client.id } } });
        return { id: client.id };
      });
    },
    day(principal: StaffPrincipal | null, shopId: string, date: string) {
      return calendar(principal, shopId, date, "day");
    },
    async create(principal: StaffPrincipal | null, shopId: string, input: OwnerBookingInput) {
      try {
        return await withBookings(principal, shopId, async (tx, shop, actorUserId, access) => {
          if (access.barberId && input.barberId !== access.barberId) throw new Error("Forbidden");
          if (!uuid.test(input.barberId) ||
            !Array.isArray(input.serviceIds) || !input.serviceIds.length ||
            input.serviceIds.some(id => typeof id !== "string" || !uuid.test(id)) ||
            !Number.isSafeInteger(input.startsAt)) throw new Error("Invalid booking input");
          const { clientId, clientName, guestName, guestPhone } = await resolveBookingIdentity(tx, shopId, actorUserId, input);
          const available = await searchBookingAvailability(tx, shopId, shop, input, clock());
          const slot = available.slots.find(slot => slot.barberId === input.barberId && slot.start === input.startsAt);
          if (!slot) throw new SlotUnavailableError();
          const appointment = await writeBooking(tx, shopId, slot, available.approvalMode, { clientId, guestName, guestPhone });
          await tx.auditEvent.create({ data: {
            barbershopId: shopId, actorUserId, event: "booking.created",
            details: { appointmentId: appointment.id, clientId, bookingIdentity: input.guest ? "guest" : input.newClient ? "new_client" : "existing_client", barberId: slot.barberId,
              startsAt: appointment.startsAt.toISOString(), serviceEndsAt: appointment.serviceEndsAt.toISOString(),
              occupiedUntil: appointment.occupiedUntil.toISOString(), status: appointment.status,
              currency: available.currency, totalPriceMinor: slot.totalPriceMinor, services: slot.services },
          } });
          return { appointment, clientName, services: slot.services, currency: available.currency,
            totalPriceMinor: slot.totalPriceMinor, timeZone: available.timeZone, barberName: slot.barberName };
        });
      } catch (error) {
        // A writer outside the owner lock still cannot bypass the exclusion constraint.
        if (isExclusionConflict(error)) throw new SlotUnavailableError();
        throw error;
      }
    },
  };
}
