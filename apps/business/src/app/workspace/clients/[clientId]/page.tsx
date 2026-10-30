import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClientProfiles, getDatabase } from "@barber/database";
import { currencyPrecision, LOCALE_COOKIE, messages, resolveLocale, shopCalendarDate } from "@barber/shared";
import { LanguageSwitcher } from "@barber/ui";
import { accounts, staffToken } from "../../../account-server";

import { OwnerMediaPanel } from "../../media-panel";
import { ClientResetForm } from "../../client-reset-form";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statusKey = { PENDING: "bookingStatusPending", CONFIRMED: "bookingStatusConfirmed", CANCELLED: "bookingStatusCancelled", COMPLETED: "bookingStatusCompleted", NO_SHOW: "bookingStatusNoShow" } as const;

export default async function ClientProfilePage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ shopId?: string; page?: string; photoPage?: string }>;
}) {
  const principal = await accounts().authenticate(await staffToken());
  if (!principal) redirect("/login");
  const { clientId } = await params;
  const { shopId, page: requestedPage, photoPage } = await searchParams;
  if (typeof shopId !== "string" || !uuid.test(shopId) || !uuid.test(clientId) ||
    !principal.memberships.some(member => member.barbershopId === shopId && member.role === "OWNER")) notFound();
  const parsed = typeof requestedPage === "string" && /^\d+$/.test(requestedPage) ? Number(requestedPage) : 1;
  const page = Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
  const profile = await createClientProfiles(getDatabase()).get(principal, shopId, clientId, page).catch(error => {
    if (error instanceof Error && error.message === "Forbidden") notFound();
    throw error;
  });
  if (!profile) notFound();
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const t = messages[locale];
  const format = (instant: Date) => new Intl.DateTimeFormat(locale, { timeZone: profile.timeZone, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).format(instant);
  const pageLink = (page: number) => `?${new URLSearchParams({ shopId, page: String(page) })}`;
  return <main className="account-shell workspace-live">
    <header className="account-header-actions"><Link className="secondary-button" href="/workspace">{t.clientBack}</Link><LanguageSwitcher /></header>
    <section className="setup-panel">
      <p>{profile.client.barbershop.name}</p><h1>{profile.client.name}</h1>
      <p><a href={`tel:${profile.client.phone}`}><bdi>{profile.client.phone}</bdi></a></p>
      {profile.client.email && <p><bdi>{profile.client.email}</bdi></p>}
      <ClientResetForm shopId={shopId} clientId={clientId} /><OwnerMediaPanel principal={principal} shopId={shopId} clientId={clientId} locale={locale} timeZone={profile.timeZone} page={typeof photoPage === "string" ? Number(photoPage) : 1} query={new URLSearchParams({ shopId, page: String(profile.page) }).toString()} />
      <h2>{t.clientHistory}</h2><p>{t.clientHistoryNote}</p><p>{t.scheduleLocalZone}: <bdi>{profile.timeZone}</bdi></p>
      {profile.appointments.length ? <ul className="managed-services">{profile.appointments.map(appointment => {
        const currency = appointment.services[0]?.currency;
        return <li key={appointment.id}>
          <div className="panel-heading"><h3>{appointment.barber.displayName}</h3><span className="neutral-badge">{t[statusKey[appointment.status]]}</span></div>
          <p><bdi>{format(appointment.startsAt)} – {format(appointment.serviceEndsAt)}</bdi></p>
          {currency ? <p>{appointment.services.map(service => service.name).join(" · ")} · <bdi>{new Intl.NumberFormat(locale, { style: "currency", currency }).format(appointment.services.reduce((sum, service) => sum + service.priceMinor, 0) / 10 ** currencyPrecision(currency))}</bdi></p> : <p>{t.bookingHistoryMissing}</p>}
          <p>{appointment.payments?.length ? t.paymentPaid : t.paymentUnpaid}</p>
          <Link className="secondary-button" href={`/workspace?date=${shopCalendarDate(appointment.startsAt, profile.timeZone)}&view=day#appointments-${shopId}`}>{t.clientOpenCalendar}</Link>
        </li>;
      })}</ul> : <p>{t.clientHistoryEmpty}</p>}
      <nav className="account-header-actions" aria-label={t.clientHistory}>
        {profile.page > 1 && <Link className="secondary-button" href={pageLink(profile.page - 1)}>{t.clientPreviousPage}</Link>}
        <span>{t.clientPage} <bdi>{profile.page} / {profile.pages}</bdi> · {t.clientAppointmentCount}: {profile.total}</span>
        {profile.page < profile.pages && <Link className="secondary-button" href={pageLink(profile.page + 1)}>{t.clientNextPage}</Link>}
      </nav>
    </section>
  </main>;
}
