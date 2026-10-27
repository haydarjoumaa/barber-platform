"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Icon, LanguageSwitcher, useLocale } from "@barber/ui";
import { registerOwner, signIn } from "./account-actions";

export function AccountForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useLocale();
  const registering = mode === "register";
  const [state, action, pending] = useActionState(registering ? registerOwner : signIn, {});
  return <div className="account-shell">
    <header className="client-header"><Link className="brand" href="/"><span className="brand-mark"><Icon name="services" /></span>{t("brand")}</Link><LanguageSwitcher /></header>
    <main className="account-card"><span className="empty-symbol"><Icon name={registering ? "shop" : "shield"} /></span><h1>{t(registering ? "authCreateTitle" : "authLoginTitle")}</h1><p>{t(registering ? "authCreateNote" : "authLoginNote")}</p>
      <form action={action} className="account-form">
        {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
        <label>{t("authEmail")}<input type="email" name="email" autoComplete="username" maxLength={254} required dir="ltr" /></label>
        <label>{t("authPassword")}<input type="password" name="password" autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 12 : undefined} maxLength={1024} required aria-describedby={registering ? "password-note" : undefined} /></label>
        {registering && <><p id="password-note" className="field-note">{t("authPasswordNote")}</p><label>{t("authShopName")}<input name="shopName" maxLength={100} autoComplete="organization" required /></label><label>{t("authShopSlug")}<input name="slug" minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoComplete="off" required dir="ltr" aria-describedby="slug-note" /></label><p className="field-note" id="slug-note">{t("authSlugNote")}</p><label>{t("authCurrency")}<select name="currency" defaultValue="" required><option value="" disabled>{t("authSelectCurrency")}</option>{Intl.supportedValuesOf("currency").map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label><p className="field-note">{t("authCurrencyNote")}</p></>}
        <button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : registering ? "authCreateButton" : "authLoginButton")}<Icon name="arrow" className="directional" /></button>
      </form><p className="account-switch">{t(registering ? "authHaveAccount" : "authNeedAccount")} <Link href={registering ? "/login" : "/register"}>{t(registering ? "authLoginButton" : "authCreateButton")}</Link></p>
    </main>
  </div>;
}
