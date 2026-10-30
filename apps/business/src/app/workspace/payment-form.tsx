"use client";
import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import { savePayment } from "./payment-actions";

export function PaymentForm({ shopId, appointmentId, paymentId, amount }: { shopId: string; appointmentId: string; paymentId?: string; amount: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(savePayment, {});
  if (!open) return <button type="button" className="secondary-button" onClick={() => setOpen(true)}>{t(paymentId ? "paymentCorrect" : "paymentRecord")}</button>;
  return <form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value={paymentId ? "void" : "record"} /><input type="hidden" name="id" value={paymentId ?? appointmentId} />
    <fieldset disabled={pending || state.success}>
      <legend>{t(paymentId ? "paymentCorrect" : "paymentRecord")}</legend>
      <p>{t(paymentId ? "paymentCorrectNote" : "paymentRecordNote")} <bdi>{amount}</bdi></p>
      {paymentId && <label>{t("paymentReason")}<textarea name="reason" required maxLength={500} /></label>}
      <div className="account-header-actions"><button className="primary-button">{t(pending ? "authWorking" : "paymentConfirm")}</button><button type="button" className="secondary-button" onClick={() => setOpen(false)}>{t("bookingCancelKeep")}</button></div>
    </fieldset>
    {state.error && <p className="form-error" role="alert">{t(state.error)}</p>}{state.success && <p role="status">{t("paymentSaved")}</p>}
  </form>;
}
