"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { useLocale } from "@barber/ui";
import { clientCancel, clientRegister, clientReset, clientSaveProfile, clientSignIn } from "./client-actions";

export function ClientAccountForm({ slug, mode, profile }: { slug: string; mode: "login" | "register" | "reset" | "profile"; profile?: { name: string; email: string | null; birthday: string } }) {
  const { t } = useLocale();
  const handler = mode === "login" ? clientSignIn : mode === "register" ? clientRegister : mode === "reset" ? clientReset : clientSaveProfile;
  const [state, action, pending] = useActionState(handler.bind(null, slug), {});
  return <form action={action} className="account-form">
    <fieldset disabled={pending}>
      <legend>{t(mode === "login" ? "authLoginButton" : mode === "register" ? "authCreateButton" : mode === "reset" ? "clientResetTitle" : "clientProfileTitle")}</legend>
      {(mode === "register" || mode === "profile") && <>
        <label>{t("bookingClientName")}<input name="name" required maxLength={100} autoComplete="name" defaultValue={profile?.name ?? ""} /></label>
        <label>{t("clientOptionalEmail")}<input name="email" type="email" maxLength={254} autoComplete="email" defaultValue={profile?.email ?? ""} /></label>
        <label>{t("clientBirthday")}<input name="birthday" type="date" autoComplete="bday" defaultValue={profile?.birthday ?? ""} /></label>
      </>}
      {mode !== "profile" && <label>{t("bookingClientPhone")}<input name="phone" type="tel" required maxLength={16} pattern="\+[1-9][0-9]{7,14}" autoComplete="username" dir="ltr" placeholder="+96170123456" /></label>}
      {mode === "reset" && <><p>{t("clientResetNote")}</p><label>{t("clientResetCode")}<input name="code" required minLength={64} maxLength={64} autoComplete="off" dir="ltr" /></label></>}
      {mode !== "profile" && <><label>{t("authPassword")}<input name="password" type="password" required minLength={mode === "login" ? 1 : 12} maxLength={1024} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label><p>{t("authPasswordNote")}</p></>}
      <button className="primary-button">{t(pending ? "authWorking" : mode === "login" ? "authLoginButton" : mode === "register" ? "authCreateButton" : "serviceSave")}</button>
    </fieldset>
    {state.error && <p className="form-error" role="alert">{t(state.error)}</p>}
    {state.success && <p role="status">{t(mode === "reset" ? "clientResetSaved" : "clientProfileSaved")}</p>}
    {mode !== "profile" && <div className="account-header-actions"><Link href={`/${slug}/login`}>{t("authLoginButton")}</Link><Link href={`/${slug}/register`}>{t("authCreateButton")}</Link><Link href={`/${slug}/reset`}>{t("clientResetTitle")}</Link></div>}
  </form>;
}

export function ClientCancelForm({ slug, appointmentId, startsAt }: { slug: string; appointmentId: string; startsAt: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(clientCancel.bind(null, slug), {});
  if (!open) return <button type="button" className="secondary-button" onClick={() => setOpen(true)}>{t("bookingCancel")}</button>;
  return <form action={action} className="account-form"><input type="hidden" name="appointmentId" value={appointmentId} /><input type="hidden" name="startsAt" value={startsAt} />
    <p>{t("clientCancelNote")}</p><button className="secondary-button" disabled={pending || state.success}>{t("bookingCancelConfirm")}</button>
    <button type="button" className="secondary-button" onClick={() => setOpen(false)}>{t("bookingCancelKeep")}</button>
    {state.error && <p role="alert">{t(state.error)}</p>}{state.success && <p role="status">{t("bookingStatusCancelled")}</p>}
  </form>;
}
