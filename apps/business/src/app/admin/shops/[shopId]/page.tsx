import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createPlatformAdministration, getDatabase } from "@barber/database";
import { LOCALE_COOKIE, messages, resolveLocale } from "@barber/shared";
import { LanguageSwitcher } from "@barber/ui";
import { accounts, staffToken } from "../../../account-server";

const statuses = { PENDING: "bookingStatusPending", CONFIRMED: "bookingStatusConfirmed", CANCELLED: "bookingStatusCancelled", COMPLETED: "bookingStatusCompleted", NO_SHOW: "bookingStatusNoShow" } as const;
export default async function SupportPage({ params }: { params: Promise<{ shopId: string }> }) {
  const principal = await accounts().authenticate(await staffToken());
  if (!principal) redirect("/login");
  const { shopId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(shopId)) notFound();
  const result = await createPlatformAdministration(getDatabase()).support(principal, shopId).catch(error => {
    if (error instanceof Error && error.message === "Forbidden") notFound();
    throw error;
  });
  if (!result) notFound();
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value), t = messages[locale];
  const format = (instant: Date) => new Intl.DateTimeFormat(locale, { timeZone: result.shop.timeZone, dateStyle: "medium", timeStyle: "short" }).format(instant);
  return <main className="account-shell"><header className="account-header-actions"><Link href="/admin">{t.adminTitle}</Link><LanguageSwitcher /></header><section className="setup-panel"><h1>{result.shop.name}</h1><p>{t.adminSupportNote}</p><p><bdi>/{result.shop.slug} · {result.shop.timeZone} · {result.shop.currency}</bdi></p><p>{result.shop.address}</p><p><bdi>{result.shop.phone}</bdi></p>
    <ul><li>{t.clientDirectory}: {result.shop._count.clients}</li><li>{t.clientAppointmentCount}: {result.shop._count.appointments}</li><li>{t.team}: {result.shop._count.barbers}</li><li>{t.services}: {result.shop._count.services}</li></ul>
    <h2>{t.adminRecentAppointments}</h2><ul className="managed-services">{result.appointments.map(appointment => <li key={appointment.id}><p>{appointment.client?.name ?? appointment.guestName ?? t.bookingGuest} · {appointment.barber.displayName}</p><p><bdi>{format(appointment.startsAt)}</bdi> · {t[statuses[appointment.status]]}</p></li>)}</ul>
  </section></main>;
}
