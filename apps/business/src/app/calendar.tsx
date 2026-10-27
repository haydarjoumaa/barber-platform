"use client";

import { useEffect, useRef, useState } from "react";
import { calendarDates, DEFAULT_TIME_ZONE, shiftCalendarDate, shopCalendarDate, type CalendarView } from "@barber/shared";
import { Icon, useLocale } from "@barber/ui";

export function AppointmentCalendar() {
  const { t, locale } = useLocale();
  const [date, setDate] = useState(() => shopCalendarDate(new Date(), DEFAULT_TIME_ZONE));
  const [view, setView] = useState<CalendarView>("week");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Start the viewport at 08:00 without hiding earlier hours or implying shop hours.
    const firstRow = scrollRef.current?.querySelector(".time-row");
    if (scrollRef.current && firstRow) scrollRef.current.scrollTop = firstRow.getBoundingClientRect().height * 8;
  }, [view]);
  const dates = calendarDates(date, view);
  const format = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  const today = shopCalendarDate(new Date(), DEFAULT_TIME_ZONE);
  return <section className="calendar-panel" aria-label={t("appointments")}>
    <div className="calendar-toolbar">
      <div className="calendar-date-controls">
        <button className="secondary-button compact" onClick={() => setDate(shopCalendarDate(new Date(), DEFAULT_TIME_ZONE))}>{t("today")}</button>
        <div className="calendar-arrows">
          <button className="icon-button previous" aria-label={t("previousPeriod")} onClick={() => setDate(shiftCalendarDate(date, view, -1))}><Icon name="chevron" /></button>
          <button className="icon-button next" aria-label={t("nextPeriod")} onClick={() => setDate(shiftCalendarDate(date, view, 1))}><Icon name="chevron" /></button>
        </div>
        <h2 aria-live="polite">{view === "week" ? `${format(dates[0]!, { month: "short", day: "numeric" })} – ${format(dates.at(-1)!, { month: "short", day: "numeric", year: "numeric" })}` : format(date, { month: "long", year: "numeric", ...(view === "day" ? { day: "numeric" } : {}) })}</h2>
      </div>
      <div className="segmented-control" role="group" aria-label={t("calendarView")}>{(["day", "week", "month"] as const).map(item => <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>{t(item)}</button>)}</div>
    </div>
    <div className="calendar-context"><span><span className="status-dot" />{t("calendarPreview")}</span><span>{t("shopTime")} · <bdi>{DEFAULT_TIME_ZONE}</bdi></span></div>
    <p className="calendar-notice">{t("calendarUnconnected")}</p>
    {view === "month" ? <div className="month-calendar">
      <div className="month-weekdays">{dates.slice(0, 7).map(day => <span key={day}>{format(day, { weekday: "short" })}</span>)}</div>
      <div className="month-days">{dates.map(day => <button key={day} className={`${day.slice(0, 7) !== date.slice(0, 7) ? "outside-month" : ""} ${day === today ? "is-today" : ""}`} aria-label={format(day, { dateStyle: "full" })} aria-current={day === today ? "date" : undefined} onClick={() => { setDate(day); setView("day"); }}><span>{format(day, { day: "numeric" })}</span></button>)}</div>
    </div> : <>
      <div className="calendar-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={t("calendarHours")}>
        <div className={`time-calendar ${view === "week" ? "week-calendar" : "day-calendar"}`}>
          <div className="time-calendar-heading"><span className="time-gutter"><Icon name="clock" /></span>{dates.map(day => <button key={day} className={day === today ? "is-today" : ""} aria-label={format(day, { dateStyle: "full" })} aria-current={day === today ? "date" : undefined} onClick={() => { setDate(day); setView("day"); }}><span>{format(day, { weekday: "short" })}</span><strong>{format(day, { day: "numeric" })}</strong></button>)}</div>
          <div className="time-grid">{Array.from({ length: 24 }, (_, hour) => <div className="time-row" key={hour}><span className="time-gutter"><bdi>{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(hour)}:00</bdi></span>{dates.map(day => <span className="time-cell" key={day} />)}</div>)}</div>
        </div>
      </div>
      <div className="calendar-empty-caption"><Icon name="appointments" />{t("noAppointmentsLoaded")}</div>
    </>}
  </section>;
}
