import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase, createServiceCatalog } from "@barber/database";
import { LOCALE_COOKIE, messages, resolveLocale } from "@barber/shared";
import { Icon, LanguageSwitcher } from "@barber/ui";
import { accounts, staffToken } from "../account-server";
import { signOut } from "../account-actions";

export default async function WorkspacePage() {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const t = messages[locale];
  const principal = await accounts().authenticate(await staffToken());
  if (!principal) redirect("/login");
  const shops = await getDatabase().barbershop.findMany({ where: { id: { in: principal.memberships.filter(m => m.role === "OWNER").map(m => m.barbershopId) }, deletedAt: null }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } });
  return <div className="account-shell workspace-live"><header className="client-header"><Link className="brand" href="/"><span className="brand-mark"><Icon name="services" /></span>{t.brand}</Link><div className="account-header-actions"><LanguageSwitcher /><form action={signOut}><button className="secondary-button">{t.authSignOut}</button></form></div></header><main><div className="page-heading"><div><p className="eyebrow">{t.business}</p><h1>{t.authWorkspaceTitle}</h1><p>{t.authWorkspaceNote}</p></div></div>{shops.length === 0 && <section className="empty-panel"><Icon name="shield" /><h2>{t.authNoShops}</h2></section>}{await Promise.all(shops.map(async shop => {
    const catalog = await createServiceCatalog(getDatabase()).list(principal, shop.id);
    return <section className="setup-panel live-shop" key={shop.id}><div className="panel-heading"><h2>{shop.name}</h2><span className="neutral-badge">{t.notPublished}</span></div><p className="panel-description">{t.authReservedSlug}: <bdi>/{shop.slug}</bdi> · {t.authCurrency}: <bdi>{catalog.currency}</bdi></p><div className="preview-notice"><p>{t.authOnboardingPending}</p></div><h3>{t.services}</h3>{catalog.services.length ? <ul className="live-service-list">{catalog.services.map(service => <li key={service.id}><span>{service.name}</span><span>{service.durationMinutes} {t.authMinutes}</span></li>)}</ul> : <p className="panel-description">{t.authNoServices}</p>}</section>;
  }))}</main></div>;
}
