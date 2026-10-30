"use client";
import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import { issueClientReset } from "./client-reset-actions";

export function ClientResetForm({ shopId, clientId }: { shopId: string; clientId: string }) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(true);
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof issueClientReset>[0], form: FormData) => {
    const result = await issueClientReset(previous, form); setVisible(true); return result;
  }, {});
  return <details><summary>{t("clientRecoveryTitle")}</summary><form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="clientId" value={clientId} />
    <p>{t("clientRecoveryNote")}</p>
    <label><input type="checkbox" name="identityVerified" required disabled={pending} />{t("clientIdentityVerified")}</label>
    <button className="secondary-button" disabled={pending}>{t(pending ? "authWorking" : "clientIssueCode")}</button>
    {state.error && <p role="alert">{t(state.error)}</p>}
  </form>{state.code && visible && <section role="status"><p>{t("clientRecoveryCodeNote")}</p><code style={{ overflowWrap: "anywhere" }} dir="ltr">{state.code}</code><p><bdi>{state.expiresAt}</bdi></p><button className="secondary-button" onClick={() => setVisible(false)}>{t("clientHideCode")}</button></section>}</details>;
}
