import { bookingCandidates, findAvailableSlots, validateBookingPolicy, type BookingPolicy } from "@barber/shared";
import type { Prisma } from "./generated/prisma/client";
import { loadBookingSchedule } from "./booking-schedule";

export class ReschedulingDeadlineError extends Error {
  constructor() { super("Rescheduling deadline passed"); }
}

const MINUTE = 60_000;
const SAVED = "saved-appointment";
export interface MovableAppointment { id: string; barberId: string; status: string; startsAt: Date; serviceEndsAt: Date; occupiedUntil: Date; }

export async function reschedulingPolicy(tx: Prisma.TransactionClient, shopId: string) {
  const stored = await tx.shopBookingPolicy.findUnique({ where: { barbershopId: shopId } });
  if (!stored) throw new Error("Booking policy missing");
  return validateBookingPolicy(stored as BookingPolicy);
}

/** True when the shop's rescheduling notice has passed; only an authorized override may proceed. */
export function reschedulingDeadlinePassed(appointment: MovableAppointment, policy: BookingPolicy, now: Date) {
  return now.getTime() > appointment.startsAt.getTime() - policy.reschedulingNoticeMinutes * MINUTE;
}

/** Internal transaction helper. The caller must hold the shop lock and have authorized the appointment.
 * Moves keep the same barber and the saved services, prices, service duration and buffer; only the start changes.
 * Slot interval, minimum notice, the 30-day horizon, schedules, closures and other bookings still apply.
 */
export async function rescheduleStarts(tx: Prisma.TransactionClient, shopId: string, timeZone: string,
  appointment: MovableAppointment, policy: BookingPolicy, date: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  const serviceMinutes = (appointment.serviceEndsAt.getTime() - appointment.startsAt.getTime()) / MINUTE;
  const bufferMinutes = (appointment.occupiedUntil.getTime() - appointment.serviceEndsAt.getTime()) / MINUTE;
  const candidates = bookingCandidates(date, timeZone, policy, now.getTime());
  if (!candidates.length) return [];
  const schedule = await loadBookingSchedule(tx, { shopId, barberId: appointment.barberId, timeZone, date,
    occupiedMinutes: serviceMinutes + bufferMinutes, candidates, excludedAppointmentId: appointment.id });
  return findAvailableSlots({ barbershopId: shopId, services: [{ id: SAVED, barbershopId: shopId, durationMinutes: serviceMinutes, priceMinor: 0 }],
    selectedServiceIds: [SAVED], barbers: [{ id: appointment.barberId, barbershopId: shopId, services: [{ serviceId: SAVED }], working: schedule.working, unavailable: schedule.unavailable }],
    candidateStarts: candidates, earliestStart: candidates[0]!, latestStart: candidates.at(-1)!, bufferAfterMinutes: bufferMinutes, closures: schedule.closures,
  }).map(slot => slot.start).filter(start => start !== appointment.startsAt.getTime());
}

/** Revalidates the requested start, then compare-and-swaps the appointment times. The exclusion constraint still guards races. */
export async function moveAppointment(tx: Prisma.TransactionClient, shopId: string, timeZone: string, appointment: MovableAppointment,
  policy: BookingPolicy, input: { date: string; startsAt: number; status: "PENDING" | "CONFIRMED" }, now: Date, where: Prisma.AppointmentWhereInput = {}) {
  if (!Number.isSafeInteger(input.startsAt)) throw new Error("Invalid slot");
  const starts = await rescheduleStarts(tx, shopId, timeZone, appointment, policy, input.date, now);
  if (!starts.includes(input.startsAt)) return null;
  const shift = input.startsAt - appointment.startsAt.getTime();
  const after = { startsAt: new Date(input.startsAt), serviceEndsAt: new Date(appointment.serviceEndsAt.getTime() + shift), occupiedUntil: new Date(appointment.occupiedUntil.getTime() + shift) };
  const changed = await tx.appointment.updateMany({
    where: { ...where, id: appointment.id, barbershopId: shopId, barberId: appointment.barberId, status: appointment.status as "PENDING" | "CONFIRMED", startsAt: appointment.startsAt },
    data: { ...after, status: input.status },
  });
  if (changed.count !== 1) throw new Error("Appointment changed");
  return { before: { startsAt: appointment.startsAt.toISOString(), status: appointment.status }, after: { startsAt: after.startsAt.toISOString(), status: input.status } };
}
