"use client";
import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import { formatMoneyMinor, shiftCalendarDate } from "@barber/shared";
import { clientReserve, clientSearch, type ClientSearchState } from "./client-actions";

export function ClientBookingForm({ slug, services, barbers, today, signedIn }: {
  slug: string; services: { id: string; name: string; priceMinor: number; durationMinutes: number; currency: string }[];
  barbers: { id: string; displayName: string }[]; today: string; signedIn: boolean;
}) {
  const { t, locale } = useLocale();
  const [date, setDate] = useState(today), [barberId, setBarber] = useState(""), [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(clientSearch.bind(null, slug), {});
  const key = JSON.stringify([date, barberId, [...selected].sort()]);
  const result = !pending && state.queryKey === key ? state.result : undefined;
  return <section><form action={action} className="account-form">
    <fieldset disabled={pending}><legend>{t("clientBookTitle")}</legend><p>{t("bookingCurrentPrice")}</p>
      {services.map(service => <label key={service.id}><input type="checkbox" name="serviceId" value={service.id} checked={selected.includes(service.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, service.id] : ids.filter(id => id !== service.id))} />{service.name} · {service.durationMinutes} {t("authMinutes")} · <bdi>{formatMoneyMinor(BigInt(service.priceMinor), service.currency, locale)}</bdi></label>)}
      <label>{t("bookingBarber")}<select name="barberId" value={barberId} onChange={event => setBarber(event.target.value)}><option value="">{t("bookingAnyBarber")}</option>{barbers.map(barber => <option key={barber.id} value={barber.id}>{barber.displayName}</option>)}</select></label>
      <label>{t("selectDate")}<input type="date" required name="date" min={today} value={date} onChange={event => setDate(event.target.value)} /></label>
      <button className="primary-button" disabled={!selected.length}>{t(pending ? "authWorking" : "bookingCheck")}</button>
    </fieldset>{state.error && <p role="alert">{t(state.error)}</p>}
  </form>
  {result && <><Reserve key={result.checkedAt} slug={slug} result={result} serviceIds={selected} signedIn={signedIn} />{result.slots.length === 0 && <button className="secondary-button" type="button" onClick={() => setDate(shiftCalendarDate(date, "day", 1))}>{t("bookingNextDate")}</button>}</>}
  </section>;
}

function Reserve({ slug, result, serviceIds, signedIn }: { slug: string; result: NonNullable<ClientSearchState["result"]>; serviceIds: string[]; signedIn: boolean }) {
  const { t, locale } = useLocale();
  const [state, action, pending] = useActionState(clientReserve.bind(null, slug), {});
  const [identity, setIdentity] = useState(signedIn ? "account" : "guest");
  const format = (date: string | number) => new Intl.DateTimeFormat(locale, { timeZone: result.timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(date));
  if (state.confirmation) {
    const c = state.confirmation;
    return <section className="setup-panel" role="status"><h2>{t("bookingCreated")}</h2><p>{c.shopName} · {c.barberName}</p><p><bdi>{format(c.startsAt)} · {c.timeZone}</bdi></p><p>{c.services.join(" · ")}</p><p><bdi>{formatMoneyMinor(BigInt(c.totalPriceMinor), c.currency, locale)}</bdi></p><p>{t(c.status === "CONFIRMED" ? "bookingStatusConfirmed" : "bookingStatusPending")}</p><p>{t("clientBookingReference")}: <bdi>{c.id}</bdi></p><p>{t("payAtShop")}</p>{identity === "guest" && <p>{t("clientGuestManage")}</p>}</section>;
  }
  if (!result.slots.length) return <p role="status">{t("bookingNoSlots")}</p>;
  return <form action={action} className="account-form">
    <input type="hidden" name="date" value={result.date} />{serviceIds.map(id => <input key={id} type="hidden" name="serviceId" value={id} />)}
    <fieldset disabled={pending}>
      <legend>{t("bookingReserve")}</legend><p><bdi>{result.timeZone}</bdi></p>
      <label>{t("clientChooseSlot")}<select name="slot" required defaultValue=""><option value="" disabled>{t("clientChooseSlot")}</option>{result.slots.map(slot => <option key={`${slot.barberId}-${slot.start}`} value={`${slot.barberId}|${slot.start}`}>{format(slot.start)} · {slot.barberName} · {formatMoneyMinor(BigInt(slot.totalPriceMinor), result.currency, locale)}</option>)}</select></label>
      {signedIn ? <label>{t("bookingIdentity")}<select name="identity" value={identity} onChange={event => setIdentity(event.target.value)}><option value="account">{t("clientMyAccount")}</option><option value="guest">{t("bookingGuest")}</option></select></label> : <input type="hidden" name="identity" value="guest" />}
      {identity === "guest" && <><label>{t("bookingClientName")}<input name="name" required maxLength={100} autoComplete="name" /></label><label>{t("bookingOptionalPhone")}<input type="tel" name="phone" pattern="\+[1-9][0-9]{7,14}" maxLength={16} autoComplete="tel" dir="ltr" /></label><p>{t("clientGuestManage")}</p></>}
      <p>{t("payAtShop")}</p><button className="primary-button">{t(pending ? "authWorking" : "bookingReserve")}</button>
    </fieldset>{state.error && <p role="alert" className="form-error">{t(state.error)}</p>}
  </form>;
}
