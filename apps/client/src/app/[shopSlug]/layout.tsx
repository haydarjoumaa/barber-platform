import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { LOCALE_COOKIE, messages, resolveLocale } from "@barber/shared";
import { LanguageSwitcher, PwaRegistration } from "@barber/ui";
import { clientShop } from "../client-server";

export async function generateMetadata({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  const shop = await clientShop(shopSlug);
  return shop ? { title: shop.name, manifest: `/${shopSlug}/manifest.webmanifest` } : { title: "Shop unavailable" };
}

export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  const shop = await clientShop(shopSlug);
  if (!shop) notFound();
  const t = messages[resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value)];
  return <div className="account-shell"><PwaRegistration script={`/${shop.slug}/sw.js`} scope={`/${shop.slug}/`} /><header className="client-header"><Link className="brand" href={`/${shop.slug}/book`}>{shop.name}</Link><nav className="account-header-actions"><Link href={`/${shop.slug}/book`}>{t.clientBookTitle}</Link><Link href={`/${shop.slug}/account`}>{t.clientMyAccount}</Link><LanguageSwitcher /></nav></header><main>{children}</main><footer className="client-footer"><p>{t.payAtShop}</p></footer></div>;
}
