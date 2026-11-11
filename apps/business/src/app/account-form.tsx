"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Icon, LanguageSwitcher, useLocale } from "@barber/ui";
import { provisionOwner, signIn } from "./account-actions";

export function AccountForm({ mode, currencies = [], shopSlug, shopName }: { mode: "login" | "create"; currencies?: string[]; shopSlug?: string; shopName?: string }) {
  const { t } = useLocale();
  const registering = mode === "create";
  const [state, action, pending] = useActionState(registering ? provisionOwner : signIn.bind(null, shopSlug), {});
  const Card = registering ? "section" : "main";
  return <div className="account-shell">
    {!registering && <header className="client-header"><Link className="brand" href={shopSlug ? `/${shopSlug}/login` : "/login"}><span className="brand-mark"><Icon name="services" /></span>{t("brand")}</Link><LanguageSwitcher /></header>}
    <Card className="account-card"><span className="empty-symbol"><Icon name={registering ? "shop" : "shield"} /></span><h1>{t(registering ? "adminCreateShop" : shopSlug ? "authLoginTitle" : "adminLoginTitle")}</h1><p>{registering ? t("adminCreateShopNote") : shopName ?? t("adminLoginNote")}</p>
      <form action={action} className="account-form">
        {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
        <label>{t("authEmail")}<input type="email" name="email" autoComplete="username" maxLength={254} required dir="ltr" /></label>
        <label>{t("authPassword")}<input type="password" name="password" autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 12 : undefined} maxLength={1024} required aria-describedby={registering ? "password-note" : undefined} /></label>
        {registering && <><p id="password-note" className="field-note">{t("authPasswordNote")}</p><label>{t("authShopName")}<input name="shopName" maxLength={100} autoComplete="organization" required /></label><label>{t("authShopSlug")}<input name="slug" minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoComplete="off" required dir="ltr" aria-describedby="slug-note" /></label><p className="field-note" id="slug-note">{t("authSlugNote")}</p><label>{t("authCurrency")}<select name="currency" defaultValue="" required><option value="" disabled>{t("authSelectCurrency")}</option>{currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label><p className="field-note">{t("authCurrencyNote")}</p></>}
        <button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : registering ? "authCreateButton" : "authLoginButton")}<Icon name="arrow" className="directional" /></button>
      </form>{state.createdSlug && <section role="status"><p>{t("adminShopCreated")}</p><Link href={`/${state.createdSlug}/login`}>{t("adminStaffLink")}: /{state.createdSlug}/login</Link></section>}
      {!registering && <p className="account-switch">{t(shopSlug ? "adminAskOwner" : "adminLoginOnly")}</p>}
    </Card>
  </div>;
}
