"use client";

import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import { confirmAppointment, cancelAppointment, recordAppointmentOutcome } from "./appointment-actions";

export function AppointmentOutcome({ shopId, appointmentId, status }: { shopId: string; appointmentId: string; status: "PENDING" | "CONFIRMED" }) {
  const { t } = useLocale();
  const [outcome, setOutcome] = useState<"COMPLETED" | "NO_SHOW" | null>(null);
  const [state, action, pending] = useActionState(recordAppointmentOutcome, {});
  if (!outcome) return <div className="account-header-actions">
    <button type="button" className="secondary-button" onClick={() => setOutcome("COMPLETED")}>{t("bookingMarkCompleted")}</button>
    <button type="button" className="secondary-button" onClick={() => setOutcome("NO_SHOW")}>{t("bookingMarkNoShow")}</button>
  </div>;
  return <form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} />
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <input type="hidden" name="expectedStatus" value={status} />
    <input type="hidden" name="outcome" value={outcome} />
    <fieldset disabled={pending || state.success}>
      <legend>{t(outcome === "COMPLETED" ? "bookingMarkCompleted" : "bookingMarkNoShow")}</legend>
      <p>{t(outcome === "COMPLETED" ? "bookingCompleteNote" : "bookingNoShowNote")}</p>
      <div className="account-header-actions"><button className="secondary-button">{t(pending ? "authWorking" : "bookingOutcomeConfirm")}</button><button type="button" className="secondary-button" onClick={() => setOutcome(null)}>{t("bookingCancelKeep")}</button></div>
    </fieldset>
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
    {state.success && <p role="status">{t("bookingOutcomeSaved")}</p>}
  </form>;
}

export function CancelAppointment({ shopId, appointmentId, status }: { shopId: string; appointmentId: string; status: "PENDING" | "CONFIRMED" }) {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(cancelAppointment, {});
  if (!confirming) return <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>{t("bookingCancel")}</button>;
  return <form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} />
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <input type="hidden" name="expectedStatus" value={status} />
    <fieldset disabled={pending || state.success}>
      <legend>{t("bookingCancel")}</legend><p>{t("bookingCancelNote")}</p>
      <label><input type="checkbox" name="overrideDeadline" /> {t("bookingCancelOverride")}</label>
      <div className="account-header-actions"><button className="secondary-button">{t(pending ? "authWorking" : "bookingCancelConfirm")}</button><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>{t("bookingCancelKeep")}</button></div>
    </fieldset>
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
    {state.success && <p role="status">{t("bookingStatusCancelled")}</p>}
  </form>;
}

export function ConfirmAppointment({ shopId, appointmentId }: { shopId: string; appointmentId: string }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(confirmAppointment, {});
  return <form action={action}>
    <input type="hidden" name="shopId" value={shopId} />
    <input type="hidden" name="appointmentId" value={appointmentId} />
    <button className="secondary-button" disabled={pending || state.success}>{t(pending ? "authWorking" : "bookingConfirm")}</button>
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
    {state.success && <p role="status">{t("bookingStatusConfirmed")}</p>}
  </form>;
}
