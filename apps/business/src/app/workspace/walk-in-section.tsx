import type { StaffPrincipal } from "@barber/auth";
import { createOwnerBookings, createWalkIns, getDatabase } from "@barber/database";
import { messages, type Locale } from "@barber/shared";
import { WalkInForm, WalkInQueue } from "./walk-in-panel";

/** Walk-ins and the optional queue for staff with appointment permission; barbers only see themselves as a barber option. */
export async function WalkInSection({ principal, shopId, clients, isOwner, locale }: { principal: StaffPrincipal; shopId: string; clients: { id: string; name: string; phone: string }[]; isOwner: boolean; locale: Locale }) {
  const t = messages[locale];
  const catalog = await createOwnerBookings(getDatabase()).catalog(principal, shopId);
  const queue = await createWalkIns(getDatabase()).queue(principal, shopId);
  const services = catalog.services.map(service => ({ id: service.id, name: service.name }));
  const barbers = catalog.barbers.map(barber => ({ id: barber.id, name: barber.displayName }));
  const entries = queue.entries.map(entry => ({ id: entry.id, name: entry.client?.name ?? entry.guestName ?? t.bookingGuest, phone: entry.client?.phone ?? entry.guestPhone,
    services: entry.services, preferredBarber: entry.preferredBarber?.displayName ?? null, createdAt: entry.createdAt.toISOString() }));
  return <section className="team-management"><h3>{t.walkInSection}</h3>
    {services.length && barbers.length ? <WalkInForm shopId={shopId} services={services} barbers={barbers} clients={clients} /> : <p>{t.walkInSetupNeeded}</p>}
    <WalkInQueue shopId={shopId} enabled={queue.enabled} entries={entries} services={services} barbers={barbers} clients={clients} isOwner={isOwner} observedAt={queue.observedAt} />
  </section>;
}
