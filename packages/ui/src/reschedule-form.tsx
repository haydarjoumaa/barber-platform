"use client";
import { useActionState, useState } from "react";
import type { RescheduleState } from "@barber/shared";
import { useLocale } from "./locale-provider";

type RescheduleAction = (state: RescheduleState, form: FormData) => Promise<RescheduleState>;

/** Two steps: find open starts for a shop-local date, then move to one. The server revalidates every move.
 * `fields` carries the app-specific identifiers (shop/appointment); `expectedStartsAt` guards stale forms.
 */
export function RescheduleForm({ action, fields, expectedBarberId, expectedStartsAt, defaultDate, timeZone, canOverride = false }: {
  action: RescheduleAction; fields: Record<string, string>; expectedBarberId: string; expectedStartsAt: string; defaultDate: string; timeZone: string; canOverride?: boolean;
}) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [barberId, setBarberId] = useState(expectedBarberId);
  const [date, setDate] = useState(defaultDate);
  const [state, formAction, pending] = useActionState(action, {});
  if (!open) return <button type="button" className="secondary-button" onClick={() => setOpen(true)}>{t("bookingReschedule")}</button>;
  const format = (value: number) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset", timeZone }).format(value);
  const hidden = <>{Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<input type="hidden" name="expectedBarberId" value={expectedBarberId} /><input type="hidden" name="expectedStartsAt" value={expectedStartsAt} /></>;
  const starts = state.date === date && state.barberId === barberId ? state.starts : undefined;
  return <div className="account-form">
    <form action={formAction}>{hidden}<input type="hidden" name="operation" value="search" />
      <fieldset disabled={pending || state.success}>
        <legend>{t("bookingReschedule")}</legend><p>{t("bookingRescheduleNote")}</p>
        <label>{t("bookingBarber")}<select name="barberId" value={barberId} onChange={event => setBarberId(event.target.value)}>
          {!state.barbers?.some(barber => barber.id === expectedBarberId) && <option value={expectedBarberId}>{t("bookingRescheduleCurrentBarber")}</option>}
          {state.barbers?.map(barber => <option key={barber.id} value={barber.id}>{barber.displayName}</option>)}
        </select></label>
        <label>{t("selectDate")}<input type="date" name="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
        <button className="secondary-button">{t(pending ? "authWorking" : "bookingRescheduleFind")}</button>
      </fieldset>
    </form>
    {starts && !state.success && (starts.length ? <form action={formAction}>{hidden}<input type="hidden" name="operation" value="move" /><input type="hidden" name="barberId" value={barberId} /><input type="hidden" name="date" value={date} />
      <fieldset disabled={pending}>
        <label>{t("bookingRescheduleChoose")}<select name="startsAt" required defaultValue="">
          <option value="" disabled>{t("bookingRescheduleChoose")}</option>
          {starts.map(start => <option key={start} value={start}>{format(start)}</option>)}
        </select></label>
        {state.deadlinePassed && <p className="field-note">{t(canOverride ? "bookingRescheduleDeadline" : "bookingRescheduleDeadlineStaff")}</p>}
        {canOverride && state.deadlinePassed && <label><input type="checkbox" name="overrideDeadline" /> {t("bookingRescheduleOverride")}</label>}
        <div className="account-header-actions"><button className="primary-button">{t(pending ? "authWorking" : "bookingRescheduleConfirm")}</button><button type="button" className="secondary-button" onClick={() => setOpen(false)}>{t("bookingCancelKeep")}</button></div>
      </fieldset>
    </form> : <p>{t("bookingRescheduleNone")}</p>)}
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
    {state.success && state.startsAt && <p role="status">{t("bookingRescheduled")} <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(state.startsAt))}</bdi></p>}
  </div>;
}
