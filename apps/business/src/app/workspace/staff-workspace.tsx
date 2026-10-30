import type { StaffPrincipal } from "@barber/auth";
import { createBookingAvailability, createOwnerBookings, getDatabase } from "@barber/database";
import { messages, type Locale } from "@barber/shared";
import { AppointmentPanel } from "./appointment-panel";
import { AvailabilityForm, RegisterClientForm } from "./booking-form";
import { SchedulePanel } from "./schedule-panel";

export async function StaffWorkspace({ principal, locale, date, view }: { principal: StaffPrincipal; locale: Locale; date?: string; view?: string }) {
  const db = getDatabase(), t = messages[locale];
  const memberships = await db.shopMembership.findMany({ where: { userId: principal.userId, role: { in: ["BARBER", "RECEPTIONIST"] }, barbershop: { deletedAt: null, suspendedAt: null } },
    select: { id: true, role: true, manageAppointments: true, manageSchedules: true, barber: { select: { id: true } }, barbershop: { select: { id: true, name: true, timeZone: true } } } });
  return <>{await Promise.all(memberships.map(async member => {
    const shop = member.barbershop;
    const canBook = member.manageAppointments && (member.role !== "BARBER" || Boolean(member.barber));
    const canSchedule = member.manageSchedules && (member.role !== "BARBER" || Boolean(member.barber));
    const booking = canBook ? await createOwnerBookings(db).catalog(principal, shop.id) : null;
    const clients = canBook ? await createOwnerBookings(db).clients(principal, shop.id) : [];
    const policy = canBook ? await createBookingAvailability(db).policy(principal, shop.id) : null;
    const barbers = canSchedule ? await db.barber.findMany({ where: { barbershopId: shop.id, ...(member.role === "BARBER" ? { id: member.barber!.id } : {}) }, select: { id: true, displayName: true } }) : [];
    return <section className="setup-panel live-shop" key={member.id}><h2>{shop.name}</h2><p>{t[member.role === "BARBER" ? "bookingBarber" : "teamReceptionist"]}</p>
      {!canBook && !canSchedule && <p>{t.teamNoPermissions}</p>}
      {booking && <><RegisterClientForm shopId={shop.id} />{policy ? <AvailabilityForm shopId={shop.id} services={booking.services} barbers={booking.barbers} clients={clients} /> : <p>{t.bookingPolicyRequired}</p>}<AppointmentPanel principal={principal} shopId={shop.id} shopName={shop.name} timeZone={shop.timeZone} locale={locale} ownerControls={false} {...(date ? { date } : {})} {...(view ? { view } : {})} /></>}
      {barbers.map(barber => <section key={barber.id}><h3>{barber.displayName}</h3><SchedulePanel principal={principal} shopId={shop.id} barberId={barber.id} locale={locale} /></section>)}
    </section>;
  }))}</>;
}
