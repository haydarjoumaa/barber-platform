"use client";
import { useActionState, useEffect, useRef } from "react";
import { LanguageSwitcher, useLocale } from "@barber/ui";
import { joinTeam } from "./actions";

export default function JoinPage() {
  const { t } = useLocale();
  const codeInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(joinTeam, {});
  useEffect(() => {
    const secret = new URLSearchParams(window.location.hash.slice(1)).get("code");
    if (secret && /^[a-f0-9]{64}$/.test(secret) && codeInput.current) {
      codeInput.current.value = secret;
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  return <main className="account-shell"><LanguageSwitcher /><section className="account-card"><h1>{t("teamJoinTitle")}</h1><p>{t("teamJoinNote")}</p><form action={action} className="account-form"><fieldset disabled={pending}>
    <label>{t("clientResetCode")}<input ref={codeInput} name="code" required minLength={64} maxLength={64} dir="ltr" autoComplete="off" /></label>
    <label>{t("authEmail")}<input name="email" type="email" required maxLength={254} autoComplete="username" /></label><label>{t("authPassword")}<input name="password" type="password" required minLength={12} maxLength={1024} autoComplete="current-password" /></label>
    <button className="primary-button">{t(pending ? "authWorking" : "teamJoinTitle")}</button></fieldset>{state.error && <p role="alert">{t(state.error)}</p>}</form></section></main>;
}
