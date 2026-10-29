"use client";

import { useActionState, useState } from "react";
import { priceInputValue, type MessageKey } from "@barber/shared";
import { useLocale } from "@barber/ui";
import { saveBarber, type BarberFormState } from "./barber-actions";

interface Member { id: string; email: string; }
interface Service { id: string; name: string; durationMinutes: number; priceMinor: number; }
interface Assignment { durationMinutes?: number; priceMinor?: number; }

function Result({ state }: { state: BarberFormState }) {
  const { t } = useLocale();
  return <>{state.error && <p role="alert" className="form-error">{t(state.error)}</p>}{state.success && <p role="status">{t("barberSaved")}</p>}</>;
}

export function BarberProfileForm({ shopId, members = [], barber }: { shopId: string; members?: Member[]; barber?: { id: string; displayName: string } }) {
  const { t } = useLocale();
  const [name, setName] = useState(barber?.displayName ?? "");
  const [membership, setMembership] = useState("");
  const [state, action, pending] = useActionState(async (previous: BarberFormState, form: FormData) => {
    const result = await saveBarber(previous, form);
    if (result.success && !barber) { setName(""); setMembership(""); }
    return result;
  }, {});
  return <form action={action} className="account-form service-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="barberId" value={barber?.id ?? ""} /><input type="hidden" name="operation" value={barber ? "rename" : "create"} />
    <fieldset disabled={pending}><legend>{t(barber ? "barberEdit" : "addBarber")}</legend>
      {!barber && <label>{t("barberMember")}<select name="membershipId" required value={membership} onChange={event => setMembership(event.target.value)}><option value="" disabled>{t("barberChooseMember")}</option>{members.map(member => <option key={member.id} value={member.id}>{member.email}</option>)}</select></label>}
      <label>{t("barberName")}<input name="displayName" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : barber ? "serviceSave" : "addBarber")}</button>
    </fieldset><Result state={state} />
  </form>;
}

export function BarberServiceForm({ shopId, barberId, currency, service, assignment }: { shopId: string; barberId: string; currency: string; service: Service; assignment?: Assignment }) {
  const { t } = useLocale();
  const [duration, setDuration] = useState(assignment?.durationMinutes === undefined ? "" : String(assignment.durationMinutes));
  const [price, setPrice] = useState(assignment?.priceMinor === undefined ? "" : priceInputValue(assignment.priceMinor, currency));
  const [state, action, pending] = useActionState(saveBarber, {});
  const [removeState, removeAction, removing] = useActionState(saveBarber, {});
  const [confirming, setConfirming] = useState(false);
  const status: MessageKey = assignment ? "barberServiceEnabled" : "barberServiceDisabled";
  const identity = <><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="barberId" value={barberId} /><input type="hidden" name="serviceId" value={service.id} /></>;
  return <section className="barber-service">
    <div className="panel-heading"><h5>{service.name}</h5><span className="neutral-badge">{t(status)}</span></div>
    <p className="field-note">{t("barberDefaults")}: <bdi>{priceInputValue(service.priceMinor, currency)} {currency}</bdi> · {service.durationMinutes} {t("authMinutes")}</p>
    <form action={action} className="account-form service-form">{identity}<input type="hidden" name="operation" value="assign" /><input type="hidden" name="displayedCurrency" value={currency} />
      <fieldset disabled={pending || removing}><legend>{t("barberOverrides")}</legend><p className="field-note">{t("barberInherit")}</p>
        <div className="barber-override-fields"><label>{t("serviceDuration")}<input name="duration" type="number" min={1} max={2147483647} step={1} placeholder={String(service.durationMinutes)} value={duration} onChange={event => setDuration(event.target.value)} /></label>
          <label>{t("servicePrice")} ({currency})<input name="price" inputMode="decimal" dir="ltr" maxLength={32} placeholder={priceInputValue(service.priceMinor, currency)} value={price} onChange={event => setPrice(event.target.value)} /></label></div>
        <p className="field-note">{t("servicePriceHint")}</p><button className="primary-button" disabled={pending || removing}>{t(pending ? "authWorking" : assignment ? "serviceSave" : "barberEnable")}</button>
      </fieldset><Result state={state} />
    </form>
    {assignment && (!confirming ? <button type="button" className="secondary-button" disabled={pending || removing} onClick={() => setConfirming(true)}>{t("barberRemove")}</button> : <form action={removeAction}>{identity}<input type="hidden" name="operation" value="remove" />
      <p className="field-note">{t("barberRemoveNote")}</p><div className="account-header-actions"><button className="secondary-button" disabled={pending || removing}>{t(removing ? "authWorking" : "barberConfirmRemove")}</button><button type="button" className="secondary-button" disabled={removing} onClick={() => setConfirming(false)}>{t("serviceKeep")}</button></div><Result state={removeState} />
    </form>)}
  </section>;
}
