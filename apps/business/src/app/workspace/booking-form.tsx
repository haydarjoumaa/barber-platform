"use client";

import { useActionState, useState } from "react";
import { currencyPrecision, shiftCalendarDate, type BookingPolicy, type MessageKey } from "@barber/shared";
import { useLocale } from "@barber/ui";
import { bookingAction, registerClientAction, type BookingFormState } from "./booking-actions";

function Result({ state }: { state: BookingFormState }) {
  const { t } = useLocale();
  return <>{state.error && <p role="alert" className="form-error">{t(state.error)} <bdi>{state.problem}</bdi></p>}{state.success && <p role="status">{t("bookingSaved")}</p>}</>;
}
export function PolicyForm({ shopId, policy }: { shopId: string; policy: BookingPolicy | null }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(bookingAction, {});
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(policy ?? {}).map(([key, value]) => [key, String(value)])));
  const fields: [keyof Omit<BookingPolicy, "approvalMode">, MessageKey][] = [["slotIntervalMinutes", "bookingInterval"], ["minimumNoticeMinutes", "bookingNotice"], ["bufferAfterMinutes", "bookingBuffer"], ["cancellationNoticeMinutes", "bookingCancelNotice"], ["reschedulingNoticeMinutes", "bookingRescheduleNotice"]];
  return <form action={action} className="account-form service-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="policy" />
    <fieldset disabled={pending}><legend>{t("bookingPolicies")}</legend><p className="field-note">{t("bookingPolicyNote")}</p>
      <div className="barber-override-fields">{fields.map(([key, label]) => <label key={key}>{t(label)}<input name={key} type="number" required step={1} min={key === "slotIntervalMinutes" ? 1 : 0} max={key === "slotIntervalMinutes" ? 1440 : 2147483647} value={values[key] ?? ""} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}</div>
      <label>{t("bookingApproval")}<select name="approvalMode" required value={values.approvalMode ?? ""} onChange={event => setValues(previous => ({ ...previous, approvalMode: event.target.value }))}><option value="" disabled>{t("bookingChooseApproval")}</option><option value="AUTOMATIC">{t("bookingAutomatic")}</option><option value="MANUAL">{t("bookingManual")}</option></select></label>
      <button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : "serviceSave")}</button>
    </fieldset><Result state={state} />
  </form>;
}
export function AvailabilityForm({ shopId, services, barbers, clients }: { shopId: string; services: { id: string; name: string }[]; barbers: { id: string; displayName: string }[]; clients: { id: string; name: string; phone: string }[] }) {
  const { t } = useLocale();
  const [date, setDate] = useState("");
  const [barberId, setBarber] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(bookingAction, {});
  const queryKey = JSON.stringify([date, barberId, [...selected].sort()]);
  const result = state.queryKey === queryKey && !pending ? state.result : undefined;
  return <div className="service-form"><form action={action} className="account-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="search" />
    <fieldset disabled={pending}><legend>{t("bookingCheck")}</legend><p className="field-note">{t("bookingCheckNote")}</p>
      <div className="booking-service-choices">{services.map(service => <label key={service.id}><input type="checkbox" name="serviceId" value={service.id} checked={selected.includes(service.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, service.id] : previous.filter(id => id !== service.id))} />{service.name}</label>)}</div>
      <label>{t("selectDate")}<input type="date" name="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>{t("bookingBarber")}<select name="barberId" value={barberId} onChange={event => setBarber(event.target.value)}><option value="">{t("bookingAnyBarber")}</option>{barbers.map(barber => <option key={barber.id} value={barber.id}>{barber.displayName}</option>)}</select></label>
      <button className="primary-button" disabled={pending || selected.length === 0}>{t(pending ? "authWorking" : "bookingCheck")}</button>
    </fieldset><Result state={state} />
  </form>
  {result && <><ReserveForm key={result.checkedAt} shopId={shopId} serviceIds={selected} clients={clients} result={result} /><button type="button" className="secondary-button" onClick={() => setDate(shiftCalendarDate(date, "day", 1))}>{t("bookingNextDate")}</button></>}
  </div>;
}

function ReserveForm({ shopId, serviceIds, clients, result }: { shopId: string; serviceIds: string[]; clients: { id: string; name: string; phone: string }[]; result: NonNullable<BookingFormState["result"]> }) {
  const { t, locale } = useLocale();
  const [state, action, pending] = useActionState(bookingAction, {});
  const [choice, setChoice] = useState("");
  const [identityMode, setIdentityMode] = useState(clients.length ? "existing" : "new");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const matchingClients = clients.filter(client => client.name.toLocaleLowerCase(locale).includes(clientSearch.trim().toLocaleLowerCase(locale)) || client.phone.includes(clientSearch.trim()));
  const slot = result.slots.find(slot => `${slot.barberId}:${slot.start}` === choice);
  const saved = state.confirmation;
  const format = (value: number | string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset", timeZone: result.timeZone }).format(new Date(value));
  const price = (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 10 ** currencyPrecision(currency));
  if (saved) return <section role="status" className="booking-confirmation"><h4>{t("bookingCreated")} · {t(statusKey[saved.status])}</h4><p>{saved.clientName}</p><p>{saved.barberName} · {saved.services.join(" · ")}</p><p><bdi>{format(saved.startsAt)}</bdi> · <bdi>{price(saved.totalPriceMinor, saved.currency)}</bdi></p><a className="secondary-button" href={`/workspace?date=${result.date}#appointments-${shopId}`}>{t("bookingViewDay")}</a></section>;
  return <form action={action} className="account-form"><input type="hidden" name="operation" value="reserve" /><input type="hidden" name="shopId" value={shopId} />
    <input type="hidden" name="date" value={result.date} /><input type="hidden" name="barberId" value={slot?.barberId ?? ""} /><input type="hidden" name="startsAt" value={slot?.start ?? ""} />
    {serviceIds.map(id => <input key={id} type="hidden" name="serviceId" value={id} />)}
    <fieldset disabled={pending || state.error === "bookingSlotTaken"}><legend>{t("bookingReserve")}</legend><p>{t("bookingCheckedAt")}: <bdi>{format(result.checkedAt)}</bdi> · {t(result.approvalMode === "AUTOMATIC" ? "bookingAutomatic" : "bookingManual")}</p>
      <p>{t("bookingCurrentPrice")}</p>
      <label>{t("bookingIdentity")}<select name="identityMode" value={identityMode} onChange={event => setIdentityMode(event.target.value)}><option value="existing">{t("bookingExistingClient")}</option><option value="new">{t("bookingQuickClient")}</option><option value="guest">{t("bookingGuestOnly")}</option></select></label>
      {identityMode === "existing" ? (clients.length ? <>
        <label>{t("bookingFindClient")}<input type="search" value={clientSearch} onChange={event => { setClientSearch(event.target.value); setSelectedClientId(""); }} /></label>
        <label>{t("bookingClient")}<select name="clientId" required value={selectedClientId} onChange={event => setSelectedClientId(event.target.value)}><option value="" disabled>{t("bookingChooseClient")}</option>{matchingClients.map(client => <option key={client.id} value={client.id}>{client.name} · {client.phone}</option>)}</select></label>
        {matchingClients.length === 0 && <p role="status">{t("bookingNoClientMatch")}</p>}
      </> : <p>{t("bookingNoClients")}</p>) : <>
        <p className="field-note">{t(identityMode === "guest" ? "bookingGuestNote" : "bookingQuickNote")}</p>
        <label>{t("bookingClientName")}<input name="contactName" required maxLength={100} autoComplete="name" /></label>
        <label>{t(identityMode === "guest" ? "bookingOptionalPhone" : "bookingClientPhone")}<input name="contactPhone" type="tel" dir="ltr" required={identityMode === "new"} maxLength={16} autoComplete="tel" placeholder="+96170123456" /></label>
      </>}
      {result.slots.length ? <ul className="availability-slots">{result.slots.map(slot => <li key={`${slot.barberId}:${slot.start}`}><label><input type="radio" name="slot" required value={`${slot.barberId}:${slot.start}`} checked={choice === `${slot.barberId}:${slot.start}`} onChange={event => setChoice(event.target.value)} /><strong>{slot.barberName}</strong> · <bdi>{format(slot.start)} – {format(slot.serviceEnd)}</bdi> · {slot.durationMinutes} {t("authMinutes")} · <bdi>{price(slot.totalPriceMinor, result.currency)}</bdi></label></li>)}</ul> : <p>{t("bookingNoSlots")}</p>}
      <button className="primary-button" disabled={pending || !slot || (identityMode === "existing" && !clients.length)}>{t(pending ? "authWorking" : "bookingReserve")}</button>
    </fieldset><Result state={state} />
  </form>;
}

const statusKey = { PENDING: "bookingStatusPending", CONFIRMED: "bookingStatusConfirmed", CANCELLED: "bookingStatusCancelled", COMPLETED: "bookingStatusCompleted", NO_SHOW: "bookingStatusNoShow" } as const;

export function RegisterClientForm({ shopId }: { shopId: string }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(registerClientAction, {});
  return <form action={action} className="account-form service-form"><input type="hidden" name="shopId" value={shopId} />
    <fieldset disabled={pending}><legend>{t("bookingRegisterClient")}</legend><p>{t("bookingClientNote")}</p>
      <label>{t("bookingClientName")}<input name="name" required maxLength={100} autoComplete="name" /></label>
      <label>{t("bookingClientPhone")}<input name="phone" type="tel" dir="ltr" required maxLength={16} autoComplete="tel" placeholder="+96170123456" /></label>
      <button className="primary-button">{t(pending ? "authWorking" : "bookingRegisterClient")}</button>
    </fieldset>{state.error && <p role="alert">{t(state.error)}</p>}{state.success && <p role="status">{t("bookingClientSaved")}</p>}
  </form>;
}
