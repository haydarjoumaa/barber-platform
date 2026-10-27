"use client";

import { createContext, useContext, useState } from "react";
import { LOCALE_COOKIE, localeDirection, messages, type Locale, type MessageKey } from "@barber/shared";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (key: MessageKey) => string } | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  function setLocale(next: Locale) {
    updateLocale(next);
    document.documentElement.lang = next;
    document.documentElement.dir = localeDirection(next);
    // This preference contains no identity or authorization data. Both apps share it on the same host.
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  return <LocaleContext.Provider value={{ locale, setLocale, t: key => messages[locale][key] }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale requires LocaleProvider");
  return value;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return <label className="language-picker"><span>{t("language")}</span><select value={locale} onChange={event => setLocale(event.target.value === "ar" ? "ar" : "en")}>
    <option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option>
  </select></label>;
}
