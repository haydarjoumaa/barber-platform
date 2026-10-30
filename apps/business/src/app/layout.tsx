import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, localeDirection, resolveLocale } from "@barber/shared";
import { ConnectivityNotice, LocaleProvider, PwaRegistration } from "@barber/ui";
import "./globals.css";

export const metadata: Metadata = { title: "Barber Platform", description: "Barber Platform · منصة الحلاقة" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return <html lang={locale} dir={localeDirection(locale)}><body><LocaleProvider initialLocale={locale}><ConnectivityNotice /><PwaRegistration script="/sw.js" scope="/" />{children}</LocaleProvider></body></html>;
}
