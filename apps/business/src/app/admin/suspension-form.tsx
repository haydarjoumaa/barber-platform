"use client";
import { useActionState } from "react";
import { useLocale } from "@barber/ui";
import { setShopSuspension } from "./actions";
export function SuspensionForm({ shopId, suspended }: { shopId: string; suspended: boolean }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(setShopSuspension, {});
  return <details><summary>{t(suspended ? "adminReactivate" : "adminSuspend")}</summary><form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value={suspended ? "reactivate" : "suspend"} />
    <fieldset disabled={pending || state.success}><p>{t("adminSuspendNote")}</p><label>{t("paymentReason")}<textarea required name="reason" maxLength={500} /></label><button className="secondary-button">{t(suspended ? "adminReactivate" : "adminSuspend")}</button></fieldset>
    {state.error && <p role="alert">{t(state.error)}</p>}{state.success && <p role="status">{t("adminSaved")}</p>}
  </form></details>;
}
