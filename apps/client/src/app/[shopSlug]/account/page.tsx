import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClientBookings, createMediaRepository, getDatabase } from "@barber/database";
import { formatMoneyMinor, LOCALE_COOKIE, messages, resolveLocale } from "@barber/shared";
import { MediaManager } from "@barber/ui";
import { saveClientMedia } from "../../media-actions";
import { clientShop, clientToken } from "../../client-server";
import { clientSignOut } from "../../client-actions";
import { ClientAccountForm, ClientCancelForm } from "../../client-account-form";

const statusKey = { PENDING: "bookingStatusPending", CONFIRMED: "bookingStatusConfirmed", CANCELLED: "bookingStatusCancelled", COMPLETED: "bookingStatusCompleted", NO_SHOW: "bookingStatusNoShow" } as const;
export default async function AccountPage({ params, searchParams }: { params: Promise<{ shopSlug: string }>; searchParams: Promise<{ view?: string; page?: string; photoPage?: string }> }) {
  const { shopSlug } = await params, query = await searchParams;
  const shop = await clientShop(shopSlug);
  if (!shop) notFound();
  const view = query.view === "history" ? "history" : "upcoming";
  const parsedPage = typeof query.page === "string" && /^\d+$/.test(query.page) ? Number(query.page) : 1;
  const profile = await createClientBookings(getDatabase()).dashboard(shopSlug, await clientToken(shop.id), view, Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1);
  if (!profile) redirect(`/${shopSlug}/login`);
  const media = await createMediaRepository(getDatabase()).clientList(shopSlug, await clientToken(shop.id), typeof query.photoPage === "string" ? Number(query.photoPage) : 1);
  const photoLink = (photoPage: number) => `?${new URLSearchParams({ view, page: String(profile.page), photoPage: String(photoPage) })}#client-photos`;
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value), t = messages[locale];
  const format = (instant: Date) => new Intl.DateTimeFormat(locale, { timeZone: profile.timeZone, dateStyle: "full", timeStyle: "short" }).format(instant);
  return <section className="setup-panel"><h1>{profile.client.name}</h1><p><bdi>{profile.client.phone}</bdi></p>
    <form action={clientSignOut.bind(null, shopSlug)}><button className="secondary-button">{t.authSignOut}</button></form>
    <nav className="account-header-actions"><Link href={`/${shopSlug}/book`}>{t.clientBookTitle}</Link><Link href="?view=upcoming" aria-current={view === "upcoming" ? "page" : undefined}>{t.clientUpcoming}</Link><Link href="?view=history" aria-current={view === "history" ? "page" : undefined}>{t.clientHistory}</Link></nav>
    <h2>{view === "upcoming" ? t.clientUpcoming : t.clientHistory}</h2>
    {profile.appointments.length ? <ul className="managed-services">{profile.appointments.map(appointment => {
      const currency = appointment.services[0]?.currency;
      return <li key={appointment.id}><h3>{appointment.barber.displayName}</h3><p><bdi>{format(appointment.startsAt)} · {profile.timeZone}</bdi></p><p>{t[statusKey[appointment.status]]} · {appointment.payments.length ? t.paymentPaid : t.paymentUnpaid}</p>
        {currency ? <p>{appointment.services.map(service => service.name).join(" · ")} · <bdi>{formatMoneyMinor(appointment.services.reduce((sum, service) => sum + BigInt(service.priceMinor), 0n), currency, locale)}</bdi></p> : <p>{t.bookingHistoryMissing}</p>}
        {(appointment.status === "PENDING" || appointment.status === "CONFIRMED") && <ClientCancelForm slug={shopSlug} appointmentId={appointment.id} startsAt={appointment.startsAt.toISOString()} />}
      </li>;
    })}</ul> : <p>{t.clientHistoryEmpty}</p>}
    <nav className="account-header-actions">{profile.page > 1 && <Link href={`?view=${view}&page=${profile.page - 1}`}>{t.clientPreviousPage}</Link>}<span>{t.clientPage} {profile.page} / {profile.pages}</span>{profile.page < profile.pages && <Link href={`?view=${view}&page=${profile.page + 1}`}>{t.clientNextPage}</Link>}</nav>
    <ClientAccountForm slug={shopSlug} mode="profile" profile={{ name: profile.client.name, email: profile.client.email, birthday: profile.client.birthday?.toISOString().slice(0, 10) ?? "" }} />
    <section id="client-photos"><MediaManager mode="client" action={saveClientMedia.bind(null, shopSlug)} timeZone={profile.timeZone} assets={media.assets.map(asset => ({ ...asset, src: `/${shopSlug}/photos/${asset.id}` }))} pagination={{ page: media.page, pages: media.pages, total: media.total, previousHref: media.page > 1 ? photoLink(media.page - 1) : null, nextHref: media.page < media.pages ? photoLink(media.page + 1) : null }} /></section>
  </section>;
}
