"use client";
import { useActionState, useEffect, useState } from "react";
import { formatMoneyMinor } from "@barber/shared";
import { useLocale } from "@barber/ui";
import { walkInAction, type WalkInState } from "./walk-in-actions";

type Option = { id: string; name: string };
export interface QueueEntryView { id: string; name: string; phone: string | null; services: string[]; preferredBarber: string | null; createdAt: string }

function Feedback({ state }: { state: WalkInState }) {
  const { t, locale } = useLocale();
  const saved = state.confirmation;
  return <>
    {state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
    {state.done && <p role="status">{t(state.done)}</p>}
    {saved && <section role="status" className="booking-confirmation"><h4>{t("walkInBooked")}</h4>{saved.clientName && <p>{saved.clientName}</p>}<p>{saved.barberName} · {saved.services.join(" · ")}</p>
      <p><bdi>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset", timeZone: saved.timeZone }).format(new Date(saved.startsAt))}</bdi> · <bdi>{formatMoneyMinor(BigInt(saved.totalPriceMinor), saved.currency, locale)}</bdi></p></section>}
  </>;
}

/** Shared fields for a walk-in or queue entry: services, barber and who the client is. */
function EntryFields({ services, barbers, clients, allowNew, barberLabel }: { services: Option[]; barbers: Option[]; clients: { id: string; name: string; phone: string }[]; allowNew: boolean; barberLabel: "bookingBarber" | "walkInPreferredBarber" }) {
  const { t } = useLocale();
  const [mode, setMode] = useState(clients.length ? "existing" : "guest");
  return <>
    <div className="booking-service-choices">{services.map(service => <label key={service.id}><input type="checkbox" name="serviceId" value={service.id} />{service.name}</label>)}</div>
    <label>{t(barberLabel)}<select name="barberId" defaultValue="">{barbers.length > 1 && <option value="">{t("bookingAnyBarber")}</option>}{barbers.map(barber => <option key={barber.id} value={barber.id}>{barber.name}</option>)}</select></label>
    <label>{t("bookingIdentity")}<select name="identityMode" value={mode} onChange={event => setMode(event.target.value)}>
      {clients.length > 0 && <option value="existing">{t("bookingExistingClient")}</option>}
      {allowNew && <option value="new">{t("bookingQuickClient")}</option>}
      <option value="guest">{t("bookingGuestOnly")}</option>
    </select></label>
    {mode === "existing" ? <label>{t("bookingClient")}<select name="clientId" required defaultValue=""><option value="" disabled>{t("bookingChooseClient")}</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name} · {client.phone}</option>)}</select></label> : <>
      <label>{t("bookingClientName")}<input name="contactName" required maxLength={100} autoComplete="name" /></label>
      <label>{t(mode === "guest" ? "bookingOptionalPhone" : "bookingClientPhone")}<input name="contactPhone" type="tel" dir="ltr" required={mode === "new"} maxLength={16} pattern="\+[1-9][0-9]{7,14}" placeholder="+96170123456" /></label>
    </>}
  </>;
}

export function WalkInForm({ shopId, services, barbers, clients }: { shopId: string; services: Option[]; barbers: Option[]; clients: { id: string; name: string; phone: string }[] }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(walkInAction, {});
  return <form action={action} className="account-form service-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="walk-in" />
    <fieldset disabled={pending}><legend>{t("walkInTitle")}</legend><p className="field-note">{t("walkInNote")}</p>
      <EntryFields services={services} barbers={barbers} clients={clients} allowNew barberLabel="bookingBarber" />
      <button className="primary-button">{t(pending ? "authWorking" : "walkInStart")}</button>
    </fieldset><Feedback state={state} />
  </form>;
}

function QueueRow({ shopId, entry, position, barbers, action, pending, now }: { shopId: string; entry: QueueEntryView; position: number; barbers: Option[]; action: (form: FormData) => void; pending: boolean; now: number }) {
  const { t, locale } = useLocale();
  const waited = Math.max(0, Math.floor((now - Date.parse(entry.createdAt)) / 60_000));
  return <li>
    <div className="panel-heading"><h4>{position}. {entry.name}</h4><span className="neutral-badge">{t("walkInWaiting")} <bdi>{new Intl.NumberFormat(locale).format(waited)}</bdi> {t("authMinutes")}</span></div>
    <p>{entry.services.join(" · ")}{entry.preferredBarber && <> · {t("walkInPreferredBarber")}: {entry.preferredBarber}</>}</p>
    {entry.phone && <p><a href={`tel:${entry.phone}`}><bdi>{entry.phone}</bdi></a></p>}
    <form action={action} className="account-header-actions"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="entryId" value={entry.id} />
      {barbers.length > 0 && <label>{t("bookingBarber")}<select name="barberId" defaultValue="" disabled={pending}><option value="">{t(entry.preferredBarber ? "walkInUsePreference" : "bookingAnyBarber")}</option>{barbers.map(barber => <option key={barber.id} value={barber.id}>{barber.name}</option>)}</select></label>}
      <button className="primary-button" name="operation" value="serve" disabled={pending || barbers.length === 0}>{t(pending ? "authWorking" : "walkInServe")}</button>
      <button className="secondary-button" name="operation" value="remove" disabled={pending}>{t("walkInRemove")}</button>
    </form>
  </li>;
}

export function WalkInQueue({ shopId, enabled, entries, services, barbers, clients, isOwner, observedAt }: { shopId: string; enabled: boolean; entries: QueueEntryView[]; services: Option[]; barbers: Option[]; clients: { id: string; name: string; phone: string }[]; isOwner: boolean; observedAt: number }) {
  const { t } = useLocale();
  // Share one clock across all rows; the server snapshot also keeps hydration deterministic.
  const [clock, setClock] = useState(observedAt);
  const hasEntries = entries.length > 0;
  useEffect(() => {
    if (!hasEntries) return;
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [hasEntries]);
  const now = Math.max(observedAt, clock);
  const [toggleState, toggle, toggling] = useActionState(walkInAction, {});
  const [addState, add, adding] = useActionState(walkInAction, {});
  // One state for every row: a served entry leaves the list, but its confirmation must stay visible.
  const [rowState, rowAction, rowPending] = useActionState(walkInAction, {});
  return <section className="service-form" aria-labelledby={`queue-${shopId}`}>
    <h4 id={`queue-${shopId}`}>{t("walkInQueueTitle")}</h4>
    {isOwner && <form action={toggle} className="account-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="toggle" /><input type="hidden" name="enabled" value={String(!enabled)} />
      <p className="field-note">{t(enabled ? "walkInQueueOnNote" : "walkInQueueOffNote")}</p>
      <button className="secondary-button" disabled={toggling}>{t(toggling ? "authWorking" : enabled ? "walkInQueueTurnOff" : "walkInQueueTurnOn")}</button><Feedback state={toggleState} />
    </form>}
    {!enabled && !isOwner && entries.length === 0 && <p>{t("walkInQueueOff")}</p>}
    {entries.length ? <ol className="managed-services">{entries.map((entry, index) => <QueueRow key={entry.id} shopId={shopId} entry={entry} position={index + 1} barbers={barbers} action={rowAction} pending={rowPending} now={now} />)}</ol> : enabled && <p>{t("walkInQueueEmpty")}</p>}
    <Feedback state={rowState} />
    {enabled && <form action={add} className="account-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="enqueue" />
      <fieldset disabled={adding}><legend>{t("walkInQueueAdd")}</legend>
        <EntryFields services={services} barbers={barbers} clients={clients} allowNew={false} barberLabel="walkInPreferredBarber" />
        <button className="primary-button">{t(adding ? "authWorking" : "walkInQueueAdd")}</button>
      </fieldset><Feedback state={addState} />
    </form>}
  </section>;
}
