import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createShopPayments, getDatabase } from "@barber/database";
import { formatMoneyMinor, LOCALE_COOKIE, messages, resolveLocale, shopCalendarDate } from "@barber/shared";
import { LanguageSwitcher } from "@barber/ui";
import { accounts, staffToken } from "../../account-server";

const statusKeys = { PENDING: "bookingStatusPending", CONFIRMED: "bookingStatusConfirmed", CANCELLED: "bookingStatusCancelled", COMPLETED: "bookingStatusCompleted", NO_SHOW: "bookingStatusNoShow" } as const;
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ shopId?: string; from?: string; to?: string }> }) {
  const principal = await accounts().authenticate(await staffToken());
  if (!principal) redirect("/login");
  const query = await searchParams;
  if (typeof query.shopId !== "string" || !principal.memberships.some(member => member.barbershopId === query.shopId && member.role === "OWNER")) notFound();
  const shop = await getDatabase().barbershop.findFirst({ where: { id: query.shopId, deletedAt: null, suspendedAt: null }, select: { id: true, name: true, timeZone: true } });
  if (!shop) notFound();
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value), t = messages[locale];
  const today = shopCalendarDate(new Date(), shop.timeZone);
  const from = typeof query.from === "string" ? query.from : `${today.slice(0, 7)}-01`;
  const to = typeof query.to === "string" ? query.to : today;
  let report;
  try { report = await createShopPayments(getDatabase()).report(principal, shop.id, from, to); }
  catch (error) { if (error instanceof Error && error.message === "Forbidden") notFound(); }
  const totals = new Map<string, bigint>();
  for (const row of report?.revenue ?? []) totals.set(row.currency, (totals.get(row.currency) ?? 0n) + BigInt(row.amountMinor));
  return <main className="account-shell workspace-live">
    <header className="account-header-actions"><Link className="secondary-button" href="/workspace">{t.clientBack}</Link><LanguageSwitcher /></header>
    <section className="setup-panel"><h1>{t.paymentReports} · {shop.name}</h1><p>{t.paymentReportNote}</p><p><bdi>{shop.timeZone}</bdi></p>
      <form className="account-form"><input type="hidden" name="shopId" value={shop.id} /><label>{t.reportFrom}<input type="date" name="from" required defaultValue={from} /></label><label>{t.reportTo}<input type="date" name="to" required defaultValue={to} /></label><button className="primary-button">{t.reportShow}</button></form>
      {!report ? <p role="alert">{t.reportFailed}</p> : <>
        <h2>{t.paymentTotal}</h2>{totals.size ? <ul>{[...totals].map(([currency, amount]) => <li key={currency}><bdi>{formatMoneyMinor(amount, currency, locale)}</bdi></li>)}</ul> : <p>{t.paymentNone}</p>}
        <h2>{t.paymentByBarber}</h2><ul className="managed-services">{report.revenue.map(row => <li key={`${row.barberId}-${row.currency}`}><strong>{row.barberName}</strong> · <bdi>{formatMoneyMinor(row.amountMinor, row.currency, locale)}</bdi> · {t.paymentReceipts}: {row.receipts}</li>)}</ul>
        <h2>{t.reportAppointments}</h2><p>{t.reportAppointmentNote}</p><ul>{report.statuses.map(row => <li key={row.status}>{t[statusKeys[row.status]]}: {row.count}</li>)}</ul>
      </>}
    </section>
  </main>;
}
