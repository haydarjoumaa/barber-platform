import type { Prisma } from "./generated/prisma/client";
import type { searchBookingAvailability } from "./booking-availability";

type Slot = Awaited<ReturnType<typeof searchBookingAvailability>>["slots"][number];
/** Shared persistence for slots already revalidated under the shop transaction lock. */
export async function writeBooking(tx: Prisma.TransactionClient, shopId: string, slot: Slot, approvalMode: string,
  identity: { clientId: string | null; guestName: string | null; guestPhone: string | null }, walkIn = false) {
  const appointment = await tx.appointment.create({ data: {
    barbershopId: shopId, barberId: slot.barberId, walkIn,
    clientId: identity.clientId, guestName: identity.guestName, guestPhone: identity.guestPhone,
    // Walk-ins are created by staff for a client already in the shop, so they never await approval.
    status: walkIn || approvalMode === "AUTOMATIC" ? "CONFIRMED" : "PENDING",
    startsAt: new Date(slot.start), serviceEndsAt: new Date(slot.serviceEnd), occupiedUntil: new Date(slot.occupiedEnd),
  } });
  await tx.appointmentService.createMany({ data: slot.services.map(service => ({ ...service, barbershopId: shopId, appointmentId: appointment.id })) });
  return appointment;
}
