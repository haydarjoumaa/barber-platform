import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase, createServiceCatalog, createBookingAvailability, createOwnerBookings } from "@barber/database";
import { LOCALE_COOKIE, messages, resolveLocale, currencyPrecision } from "@barber/shared";
import { Icon, LanguageSwitcher } from "@barber/ui";
import { accounts, staffToken } from "../account-server";
import { ArchiveService, CurrencyForm, ServiceForm } from "./service-form";
import { BarberProfileForm, BarberServiceForm } from "./barber-form";
import { SchedulePanel, ClosurePanel } from "./schedule-panel";
import { PolicyForm, AvailabilityForm, RegisterClientForm } from "./booking-form";
import { AppointmentPanel } from "./appointment-panel";
import { signOut } from "../account-actions";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const { date, view } = await searchParams;
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const t = messages[locale];
  const principal = await accounts().authenticate(await staffToken());
  if (!principal) redirect("/login");
  const shops = await getDatabase().barbershop.findMany({ where: { id: { in: principal.memberships.filter(m => m.role === "OWNER").map(m => m.barbershopId) }, deletedAt: null }, select: { id: true, name: true, slug: true, timeZone: true }, orderBy: { name: "asc" } });
  return <div className="account-shell workspace-live"><header className="client-header"><Link className="brand" href="/"><span className="brand-mark"><Icon name="services" /></span>{t.brand}</Link><div className="account-header-actions"><LanguageSwitcher /><form action={signOut}><button className="secondary-button">{t.authSignOut}</button></form></div></header><main><div className="page-heading"><div><p className="eyebrow">{t.business}</p><h1>{t.authWorkspaceTitle}</h1><p>{t.authWorkspaceNote}</p></div></div>{shops.length === 0 && <section className="empty-panel"><Icon name="shield" /><h2>{t.authNoShops}</h2></section>}{await Promise.all(shops.map(async shop => {
    const catalog = await createServiceCatalog(getDatabase()).list(principal, shop.id);
    const clients = await createOwnerBookings(getDatabase()).clients(principal, shop.id);
    const policy = await createBookingAvailability(getDatabase()).policy(principal, shop.id);
    return <section className="setup-panel live-shop" key={shop.id}><div className="panel-heading"><h2>{shop.name}</h2><span className="neutral-badge">{t.notPublished}</span></div><p className="panel-description">{t.authReservedSlug}: <bdi>/{shop.slug}</bdi> · {t.authCurrency}: <bdi>{catalog.currency}</bdi></p><div className="preview-notice"><p>{t.authOnboardingPending}</p></div><h3>{t.services}</h3>{catalog.currency ? <>
      {catalog.services.length ? <ul className="managed-services">{catalog.services.map(service => <li key={service.id}>
        <div className="panel-heading"><h4>{service.name}</h4><span><bdi>{new Intl.NumberFormat(locale, { style: "currency", currency: catalog.currency! }).format(service.priceMinor / 10 ** currencyPrecision(catalog.currency!))}</bdi> · {service.durationMinutes} {t.authMinutes}</span></div>
        <details><summary>{t.serviceEdit}</summary><ServiceForm shopId={shop.id} currency={catalog.currency!} service={service} /></details>
        <ArchiveService shopId={shop.id} serviceId={service.id} />
      </li>)}</ul> : <p className="panel-description">{t.authNoServices}</p>}
      <ServiceForm shopId={shop.id} currency={catalog.currency} />
    </> : <CurrencyForm shopId={shop.id} currencies={Intl.supportedValuesOf("currency")} />}
      <section className="team-management"><h3>{t.team}</h3><p className="panel-description">{t.barberProfileNote}</p>
        {catalog.availableMembers.length ? <BarberProfileForm shopId={shop.id} members={catalog.availableMembers} /> : <p className="field-note">{t.barberNoMembers}</p>}
        {catalog.barbers.length === 0 && <p>{t.barberNoProfiles}</p>}
        {catalog.barbers.map(barber => <article className="barber-profile" key={barber.id}><h4>{barber.displayName}</h4><p className="field-note">{t.barberSchedulePending}</p>
          <details><summary>{t.barberEdit}</summary><BarberProfileForm shopId={shop.id} barber={barber} /></details>
          <details><summary>{t.barberServices} ({barber.services.length})</summary>
            {catalog.services.length === 0 && <p>{t.authNoServices}</p>}
            {catalog.currency && catalog.services.map(service => {
              const assignment = barber.services.find(option => option.serviceId === service.id);
              return <BarberServiceForm key={`${service.id}:${assignment ? 'enabled' : 'disabled'}`} shopId={shop.id} barberId={barber.id} currency={catalog.currency!} service={service} {...(assignment ? { assignment } : {})} />;
            })}
          </details>
        <SchedulePanel principal={principal} shopId={shop.id} barberId={barber.id} locale={locale} /></article>)}
      </section>
      <ClosurePanel principal={principal} shopId={shop.id} locale={locale} />
      <section className="team-management"><RegisterClientForm shopId={shop.id} /><PolicyForm shopId={shop.id} policy={policy} />{policy ? <AvailabilityForm key={JSON.stringify(policy)} shopId={shop.id} services={catalog.services} barbers={catalog.barbers} clients={clients} /> : <p>{t.bookingPolicyRequired}</p>}</section>
      <AppointmentPanel principal={principal} shopId={shop.id} timeZone={shop.timeZone} locale={locale} {...(date ? { date } : {})} {...(view ? { view } : {})} />
    </section>;
  }))}</main></div>;
}
