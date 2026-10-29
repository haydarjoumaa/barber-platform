"use client";

import { useActionState, useState } from "react";
import { currencyPrecision, priceInputValue } from "@barber/shared";
import { useLocale } from "@barber/ui";
import { saveService, type ServiceFormState } from "./service-actions";

interface EditableService { id: string; name: string; durationMinutes: number; priceMinor: number; }
export function ServiceForm({ shopId, currency, service }: { shopId: string; currency: string; service?: EditableService }) {
  const { t } = useLocale();
  const [name, setName] = useState(service?.name ?? "");
  const [duration, setDuration] = useState(String(service?.durationMinutes ?? 30));
  const [price, setPrice] = useState(service ? priceInputValue(service.priceMinor, currency) : "");
  const [state, action, pending] = useActionState(async (previous: ServiceFormState, form: FormData) => {
    const result = await saveService(previous, form);
    if (result.success && !service) { setName(""); setDuration("30"); setPrice(""); }
    return result;
  }, {});
  return <form action={action} className="account-form service-form">
    <input type="hidden" name="shopId" value={shopId} />
    <input type="hidden" name="displayedCurrency" value={currency} />
    <input type="hidden" name="serviceId" value={service?.id ?? ""} />
    <input type="hidden" name="operation" value={service ? "update" : "create"} />
    <fieldset disabled={pending}>
      <legend>{t(service ? "serviceEdit" : "addService")}</legend>
      <div className="service-fields">
        <label>{t("serviceName")}<input name="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>{t("serviceDuration")}<input name="duration" type="number" min={1} max={2147483647} step={1} required value={duration} onChange={event => setDuration(event.target.value)} /></label>
        <label>{t("servicePrice")} ({currency})<input name="price" inputMode="decimal" required maxLength={32} dir="ltr" value={price} onChange={event => setPrice(event.target.value)} placeholder={priceInputValue(0, currency)} /></label>
      </div>
      <p className="field-note">{t("servicePrecision")} {currencyPrecision(currency)}. {t("servicePriceHint")}</p>
      <button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : service ? "serviceSave" : "addService")}</button>
    </fieldset>
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
    {state.success && <p role="status">{t("serviceSaved")}</p>}
  </form>;
}

export function ArchiveService({ shopId, serviceId }: { shopId: string; serviceId: string }) {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(saveService, {});
  return <div className="service-archive">{!confirming ? <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>{t("serviceArchive")}</button> : <form action={action}>
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="serviceId" value={serviceId} /><input type="hidden" name="operation" value="archive" />
    <p>{t("serviceArchiveNote")}</p><div className="account-header-actions"><button className="secondary-button" disabled={pending}>{t(pending ? "authWorking" : "serviceConfirmArchive")}</button><button type="button" className="secondary-button" disabled={pending} onClick={() => setConfirming(false)}>{t("serviceKeep")}</button></div>
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
  </form>}</div>;
}

export function CurrencyForm({ shopId, currencies }: { shopId: string; currencies: string[] }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(saveService, {});
  return <form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="currency" />
    <label>{t("authCurrency")}<select name="currency" defaultValue="" required disabled={pending}><option value="" disabled>{t("authSelectCurrency")}</option>{currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
    <p className="field-note">{t("authCurrencyNote")}</p><button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : "serviceSave")}</button>
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
  </form>;
}
