import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createPlatformAdministration, getDatabase } from "@barber/database";
import { LOCALE_COOKIE, messages, resolveLocale } from "@barber/shared";
import { LanguageSwitcher } from "@barber/ui";
import { accounts, staffToken } from "../account-server";
import { SuspensionForm } from "./suspension-form";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const principal = await accounts().authenticate(await staffToken());
  if (!principal) redirect("/login");
  const query = await searchParams;
  const result = await createPlatformAdministration(getDatabase()).list(principal, typeof query.page === "string" ? Number(query.page) : 1).catch(error => {
    if (error instanceof Error && error.message === "Forbidden") notFound();
    throw error;
  });
  const t = messages[resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value)];
  return <main className="account-shell"><header className="account-header-actions"><Link href="/workspace">{t.clientBack}</Link><LanguageSwitcher /></header><section className="setup-panel"><h1>{t.adminTitle}</h1><p>{t.adminShops}: {result.total}</p>
    <ul className="managed-services">{result.shops.map(shop => <li key={shop.id}><h2><Link href={`/admin/shops/${shop.id}`}>{shop.name}</Link></h2><p><bdi>/{shop.slug}</bdi></p><p>{shop.deletedAt ? t.adminDeactivated : shop.suspendedAt ? t.adminSuspended : shop.publishedAt ? t.adminPublished : t.notPublished}</p>{!shop.deletedAt && <SuspensionForm key={`${shop.id}-${Boolean(shop.suspendedAt)}`} shopId={shop.id} suspended={Boolean(shop.suspendedAt)} />}</li>)}</ul>
    <nav className="account-header-actions">{result.page > 1 && <Link href={`?page=${result.page - 1}`}>{t.clientPreviousPage}</Link>}<span>{result.page} / {result.pages}</span>{result.page < result.pages && <Link href={`?page=${result.page + 1}`}>{t.clientNextPage}</Link>}</nav>
  </section></main>;
}
