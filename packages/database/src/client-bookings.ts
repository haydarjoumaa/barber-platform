import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { clientIdentity, throttleClient, withPublishedShop } from "./client-access";
import { searchBookingAvailability } from "./booking-availability";
import { writeBooking } from "./booking-write";
import { CancellationDeadlineError, SlotUnavailableError } from "./bookings";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface ClientSlotInput { date: string; serviceIds: string[]; barberId?: string; }
function selection(input: ClientSlotInput) {
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !Array.isArray(input.serviceIds) || !input.serviceIds.length || input.serviceIds.length > 100 ||
    input.serviceIds.some(id => typeof id !== "string" || !uuid.test(id)) || (input.barberId !== undefined && !uuid.test(input.barberId))) throw new Error("Invalid selection");
}
export function createClientBookings(db: PrismaClient) {
  return {
    storefront(slug: string) {
      return withPublishedShop(db, slug, async (tx, shop) => {
        const services = await tx.service.findMany({ where: { barbershopId: shop.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, priceMinor: true, durationMinutes: true, currency: true } });
        const barbers = await tx.barber.findMany({ where: { barbershopId: shop.id }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
        return { shop: { id: shop.id, slug: shop.slug, name: shop.name, currency: shop.currency, timeZone: shop.time_zone }, services, barbers };
      });
    },
    async search(slug: string, input: ClientSlotInput) {
      selection(input);
      const shop = await db.barbershop.findFirst({ where: { slug, deletedAt: null, suspendedAt: null, publishedAt: { not: null } }, select: { id: true } });
      if (!shop) throw new Error("Shop unavailable");
      await throttleClient(db, shop.id, "availability", "public", 150);
      return withPublishedShop(db, slug, (tx, shop) => searchBookingAvailability(tx, shop.id, shop, input, new Date()));
    },
    async create(slug: string, token: string | undefined, input: ClientSlotInput & { barberId: string; startsAt: number; guest?: { name: string; phone: string } }) {
      selection(input);
      if (!uuid.test(input.barberId) || !Number.isSafeInteger(input.startsAt)) throw new Error("Invalid slot");
      const shop = await db.barbershop.findFirst({ where: { slug, deletedAt: null, suspendedAt: null, publishedAt: { not: null } }, select: { id: true } });
      if (!shop) throw new Error("Shop unavailable");
      await throttleClient(db, shop.id, "booking", token ?? input.guest?.phone ?? "guest", 20);
      try {
        return await withPublishedShop(db, slug, async (tx, lockedShop) => {
          if (lockedShop.id !== shop.id) throw new Error("Shop changed");
          const client = input.guest ? null : await clientIdentity(tx, shop.id, token);
          let guestName: string | null = null, guestPhone: string | null = null;
          if (!client) {
            const guest = input.guest;
            if (!guest || typeof guest.name !== "string" || !guest.name.trim() || guest.name.trim().length > 100 || typeof guest.phone !== "string" || (guest.phone.trim() && !/^\+[1-9]\d{7,14}$/.test(guest.phone.trim()))) throw new Error("Sign in or enter guest contact");
            guestName = guest.name.trim(); guestPhone = guest.phone.trim() || null;
          }
          const available = await searchBookingAvailability(tx, shop.id, lockedShop, input, new Date());
          const slot = available.slots.find(slot => slot.barberId === input.barberId && slot.start === input.startsAt);
          if (!slot) throw new SlotUnavailableError();
          const appointment = await writeBooking(tx, shop.id, slot, available.approvalMode, { clientId: client?.id ?? null, guestName, guestPhone });
          await tx.clientEvent.create({ data: { barbershopId: shop.id, clientId: client?.id ?? null, event: "booking.created", details: { appointmentId: appointment.id, identity: client ? "client" : "guest", startsAt: appointment.startsAt.toISOString(), barberId: slot.barberId } } });
          return { id: appointment.id, shopName: lockedShop.name, barberName: slot.barberName, timeZone: available.timeZone, startsAt: appointment.startsAt.toISOString(), status: appointment.status, totalPriceMinor: slot.totalPriceMinor, currency: available.currency, services: slot.services.map(service => service.name) };
        });
      } catch (error) {
        const meta = error && typeof error === "object" && "meta" in error ? error.meta as { driverAdapterError?: { cause?: { originalCode?: string } } } : undefined;
        if (meta?.driverAdapterError?.cause?.originalCode === "23P01") throw new SlotUnavailableError();
        throw error;
      }
    },
    dashboard(slug: string, token: string | undefined, view: "upcoming" | "history", requestedPage = 1) {
      return withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (!client) return null;
        if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new Error("Invalid page");
        const now = new Date();
        const where: Prisma.AppointmentWhereInput = { barbershopId: shop.id, clientId: client.id,
          ...(view === "upcoming" ? { startsAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } } : { OR: [{ startsAt: { lt: now } }, { status: { in: ["CANCELLED", "COMPLETED", "NO_SHOW"] } }] }) };
        const total = await tx.appointment.count({ where }), pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(requestedPage, pages);
        const appointments = await tx.appointment.findMany({ where, orderBy: [{ startsAt: view === "upcoming" ? "asc" : "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20,
          select: { id: true, startsAt: true, status: true, barber: { select: { displayName: true } }, services: { orderBy: { position: "asc" }, select: { name: true, priceMinor: true, currency: true } }, payments: { where: { voidedAt: null }, select: { id: true } } } });
        return { client, appointments, timeZone: shop.time_zone, total, page, pages };
      });
    },
    cancel(slug: string, token: string | undefined, appointmentId: string, expectedStartsAt: string) {
      return withPublishedShop(db, slug, async (tx, shop) => {
        const client = await clientIdentity(tx, shop.id, token);
        if (!client || !uuid.test(appointmentId)) throw new Error("Sign in required");
        const appointment = await tx.appointment.findFirst({ where: { id: appointmentId, barbershopId: shop.id, clientId: client.id, status: { in: ["PENDING", "CONFIRMED"] } } });
        if (!appointment || appointment.startsAt.toISOString() !== expectedStartsAt) throw new Error("Appointment changed");
        const policy = await tx.shopBookingPolicy.findUnique({ where: { barbershopId: shop.id } });
        if (!policy) throw new Error("Booking policy missing");
        if (Date.now() > appointment.startsAt.getTime() - policy.cancellationNoticeMinutes * 60_000) throw new CancellationDeadlineError();
        const changed = await tx.appointment.updateMany({ where: { id: appointmentId, barbershopId: shop.id, clientId: client.id, status: appointment.status, startsAt: appointment.startsAt }, data: { status: "CANCELLED" } });
        if (changed.count !== 1) throw new Error("Appointment changed");
        await tx.clientEvent.create({ data: { barbershopId: shop.id, clientId: client.id, event: "booking.cancelled", details: { appointmentId, previousStatus: appointment.status } } });
      });
    },
  };
}
