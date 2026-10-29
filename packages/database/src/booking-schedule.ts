import { availabilityDates, resolveClosureDate } from "@barber/shared";
import type { Prisma } from "./generated/prisma/client";
import { loadStoredSchedule } from "./stored-schedule";

/** Internal transaction helper. Authorize the shop/barber first. Any excluded
 * appointment must be loaded and authorized by the caller, never trusted from a request.
 */
export async function loadBookingSchedule(tx: Prisma.TransactionClient, input: {
  shopId: string; barberId: string; timeZone: string; date: string;
  occupiedMinutes: number; candidates: number[]; excludedAppointmentId?: string;
}) {
  const { shopId, barberId, timeZone, date, occupiedMinutes, candidates, excludedAppointmentId } = input;
  if (!candidates.length) throw new Error("Candidate slots required");
  const dates = availabilityDates(date, occupiedMinutes, timeZone, candidates.at(-1)!);
  const schedule = await loadStoredSchedule(tx, shopId, barberId, timeZone, dates);
  const end = resolveClosureDate(dates.at(-1)!, timeZone).end;
  const appointments = await tx.appointment.findMany({ where: {
    barbershopId: shopId, barberId, status: { not: "CANCELLED" },
    ...(excludedAppointmentId ? { id: { not: excludedAppointmentId } } : {}),
    startsAt: { lt: new Date(end) }, occupiedUntil: { gt: new Date(candidates[0]!) },
  }, select: { startsAt: true, occupiedUntil: true } });
  return { ...schedule, unavailable: [...schedule.unavailable,
    ...appointments.map(row => ({ start: row.startsAt.getTime(), end: row.occupiedUntil.getTime() }))] };
}
