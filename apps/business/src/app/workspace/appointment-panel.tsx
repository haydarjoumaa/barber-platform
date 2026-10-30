import { createOwnerBookings, getDatabase } from "@barber/database";
import type { StaffPrincipal } from "@barber/auth";
import { ConfirmAppointment, CancelAppointment, AppointmentOutcome, CorrectAppointmentOutcome } from "./appointment-form";
import { calendarDates, currencyPrecision, formatMoneyMinor, messages, shiftCalendarDate, shopCalendarDate, type Locale } from "@barber/shared";

import { filterAppointments, calendarFilterLink } from "./calendar-filter";
import { PaymentForm } from "./payment-form";
import { AppointmentMessage } from "./appointment-message";

const statusKey = { PENDING: "bookingStatusPending", CONFIRMED: "bookingStatusConfirmed", CANCELLED: "bookingStatusCancelled", COMPLETED: "bookingStatusCompleted", NO_SHOW: "bookingStatusNoShow" } as const;
export async function AppointmentPanel({ principal, shopId, shopName, timeZone, date: requested, view: requestedView, search, status, locale, ownerControls = true }: { principal: StaffPrincipal; shopId: string; shopName: string; timeZone: string; date?: string; view?: string; search?: string; status?: string; locale: Locale; ownerControls?: boolean }) {
  const t = messages[locale];
  let date = shopCalendarDate(new Date(), timeZone);
  if (requested) { try { date = calendarDates(requested, "day")[0]!; } catch { /* Invalid URL dates fall back to today. */ } }
  const view = requestedView === "week" || requestedView === "month" ? requestedView : "day";
  const result = await createOwnerBookings(getDatabase()).calendar(principal, shopId, date, view);
  const appointments = filterAppointments(result.appointments, search, status);
  const format = (value: Date) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset", timeZone }).format(value);
  const link = (date: string, selectedView = view) => calendarFilterLink(date, selectedView, shopId, search, status);
  return <section id={`appointments-${shopId}`} className="team-management"><h3>{t.bookingDay}</h3><p>{t.scheduleLocalZone}: <bdi>{timeZone}</bdi></p>
    <nav className="account-header-actions saved-calendar-views" aria-label={t.calendarView}>{(["day", "week", "month"] as const).map(option => <a key={option} className="secondary-button" href={link(date, option)} aria-current={view === option ? "page" : undefined}>{t[option]}</a>)}</nav>
    <form action={`/workspace#appointments-${shopId}`} className="account-form"><input type="hidden" name="view" value={view} /><label>{t.calendarSearch}<input type="search" name="search" maxLength={100} defaultValue={search ?? ""} /></label><label>{t.whatsappStatus}<select name="status" defaultValue={status ?? ""}><option value="">{t.calendarAllStatuses}</option>{Object.entries(statusKey).map(([value, key]) => <option key={value} value={value}>{t[key]}</option>)}</select></label><label>{t.selectDate}<input type="date" name="date" required defaultValue={date} /></label><button className="secondary-button">{t.bookingViewDay}</button></form>
    <div className="calendar-date-controls"><a className="secondary-button" href={link(shiftCalendarDate(date, view, -1))}>{t.previousPeriod}</a><strong><bdi>{view === "day" ? date : `${result.days[0]!.date} – ${result.days.at(-1)!.date}`}</bdi></strong><a className="secondary-button" href={link(shiftCalendarDate(date, view, 1))}>{t.nextPeriod}</a></div>
    {view !== "day" ? <><p className="field-note">{t.bookingCalendarNote}</p><div className="saved-calendar-grid">{result.days.map(day => {
      const dayAppointments = appointments.filter(appointment => appointment.startsAt.getTime() < day.end && appointment.occupiedUntil.getTime() > day.start);
      const label = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone }).format(new Date(day.start));
      return <section key={day.date} className={`saved-calendar-day${day.date === date ? " selected" : ""}${view === "month" && day.date.slice(0, 7) !== date.slice(0, 7) ? " outside-month" : ""}`}>
        <h4><a href={link(day.date, "day")}><time dateTime={day.date}>{label}</time></a></h4>
        {dayAppointments.length ? <ul>{dayAppointments.map(appointment => <li key={appointment.id}><a href={link(day.date, "day")}>
          <strong>{appointment.client?.name ?? appointment.guestName ?? t.bookingGuest} · {appointment.barber.displayName}</strong>
          <span><bdi>{format(appointment.startsAt)} – {format(appointment.serviceEndsAt)}</bdi></span>
          <span>{t[statusKey[appointment.status]]}</span>
        </a></li>)}</ul> : <p className="field-note">{t.bookingDayEmpty}</p>}
      </section>;
    })}</div></> : appointments.length ? <ul className="managed-services">{appointments.map(appointment => <li key={appointment.id}>
      <div className="panel-heading"><h4>{appointment.client?.name ?? appointment.guestName ?? t.bookingGuest} · {appointment.barber.displayName}</h4><span className="neutral-badge">{t[statusKey[appointment.status]]}</span></div>
      <p><bdi>{format(appointment.startsAt)} – {format(appointment.serviceEndsAt)}</bdi></p>
      {(appointment.client?.phone || appointment.guestPhone) && <p><a href={`tel:${appointment.client?.phone ?? appointment.guestPhone}`}><bdi>{appointment.client?.phone ?? appointment.guestPhone}</bdi></a></p>}
      {appointment.services.length ? <p>{appointment.services.map(service => service.name).join(" · ")} · <bdi>{new Intl.NumberFormat(locale, { style: "currency", currency: appointment.services[0]!.currency }).format(appointment.services.reduce((sum, service) => sum + service.priceMinor, 0) / 10 ** currencyPrecision(appointment.services[0]!.currency))}</bdi></p> : <p>{t.bookingHistoryMissing}</p>}
      <p className="neutral-badge">{appointment.payments.length ? t.paymentPaid : t.paymentUnpaid}</p>
      {ownerControls && appointment.services.length > 0 && <PaymentForm key={appointment.payments[0]?.id ?? `unpaid-${appointment.id}`} shopId={shopId} appointmentId={appointment.id} {...(appointment.payments[0] ? { paymentId: appointment.payments[0].id } : {})} amount={formatMoneyMinor(appointment.services.reduce((sum, service) => sum + BigInt(service.priceMinor), 0n), appointment.services[0]!.currency, locale)} />}
      {ownerControls && appointment.client && <p><a href={`/workspace/clients/${appointment.client.id}?shopId=${shopId}`}>{t.clientViewProfile}</a></p>}
      <AppointmentMessage locale={locale} phone={appointment.client?.phone ?? appointment.guestPhone} appointment={{ shopName, clientName: appointment.client?.name ?? appointment.guestName ?? t.bookingGuest, barberName: appointment.barber.displayName, startsAt: appointment.startsAt, timeZone, status: appointment.status, services: appointment.services }} />
      {ownerControls && (appointment.status === "COMPLETED" || appointment.status === "NO_SHOW") && <CorrectAppointmentOutcome key={`correction-${appointment.status}`} shopId={shopId} appointmentId={appointment.id} status={appointment.status} />}
      {appointment.status === "PENDING" && <ConfirmAppointment shopId={shopId} appointmentId={appointment.id} />}
      {(appointment.status === "PENDING" || appointment.status === "CONFIRMED") && <CancelAppointment canOverride={ownerControls} key={appointment.status} shopId={shopId} appointmentId={appointment.id} status={appointment.status} />}
      {(appointment.status === "PENDING" || appointment.status === "CONFIRMED") && <AppointmentOutcome key={`outcome-${appointment.status}`} shopId={shopId} appointmentId={appointment.id} status={appointment.status} />}
    </li>)}</ul> : <p>{t.bookingDayEmpty}</p>}
  </section>;
}
