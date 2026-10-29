import type { StaffPrincipal } from "@barber/auth";
import { createBarberSchedules, getDatabase } from "@barber/database";
import { messages, scheduleClock, overrideFromPeriods, type SchedulePeriodInput, type Locale } from "@barber/shared";
import { RemoveSchedule, ScheduleEditor, SchedulePreview } from "./schedule-form";
import { OverrideForm, ClosureForm } from "./schedule-exceptions-form";

export async function SchedulePanel({ principal, shopId, barberId, locale }: { principal: StaffPrincipal; shopId: string; barberId: string; locale: Locale }) {
  const saved = await createBarberSchedules(getDatabase()).list(principal, shopId, barberId);
  const t = messages[locale];
  const timestamp = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset", timeZone: saved.timeZone });
  const revision = JSON.stringify([saved.periods, saved.timeOff, saved.overrides, saved.closures]);
  return <details className="schedule-panel"><summary>{t.scheduleTitleManage}</summary>
    <p className="field-note">{t.scheduleLocalZone}: <bdi>{saved.timeZone}</bdi></p><p className="field-note">{t.scheduleManageNote}</p>
    <h5>{t.scheduleWeekly}</h5>
    {saved.periods.length === 0 && <p>{t.scheduleNone}</p>}
    <ul className="managed-services">{saved.periods.map(period => <li key={period.id}>
      <p>{new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + period.dayOfWeek)))} · {period.kind === "WORK" ? t.scheduleWork : t.scheduleBreak}</p>
      <p><bdi>{scheduleClock(period.startMinute)}</bdi> {period.startMinute >= 1440 && t.scheduleNextDay} – <bdi>{scheduleClock(period.endMinute)}</bdi> {period.endMinute >= 1440 && t.scheduleNextDay}</p>
      <p className="field-note">{t.scheduleStart}: {period.startOccurrence === "earlier" ? t.scheduleEarlier : period.startOccurrence === "later" ? t.scheduleLater : t.scheduleAsk} · {t.scheduleEnd}: {period.endOccurrence === "earlier" ? t.scheduleEarlier : period.endOccurrence === "later" ? t.scheduleLater : t.scheduleAsk}</p>
      <RemoveSchedule shopId={shopId} barberId={barberId} id={period.id} kind="period" />
    </li>)}</ul>
    <ScheduleEditor shopId={shopId} barberId={barberId} mode="period" />
    <h5>{t.scheduleOverrides}</h5>
    {saved.overrides.map(row => {
      const date = row.date.toISOString().slice(0, 10);
      const override = overrideFromPeriods(date, row.periods);
      return <section key={row.id} className="barber-service"><h6><bdi>{date}</bdi></h6>
        {override.working.length === 0 && <p>{t.scheduleNoShiftStarts}</p>}
        <OverrideForm key={JSON.stringify(row.periods)} shopId={shopId} barberId={barberId} date={date} periods={row.periods as unknown as SchedulePeriodInput[]} />
        <RemoveSchedule shopId={shopId} barberId={barberId} id={row.id} kind="override" />
      </section>;
    })}
    <OverrideForm shopId={shopId} barberId={barberId} />
    <h5>{t.scheduleTimeOff}</h5>
    {saved.timeOff.length === 0 && <p>{t.scheduleNone}</p>}
    <ul className="managed-services">{saved.timeOff.map(item => <li key={item.id}><span><bdi>{timestamp.format(item.startsAt)} – {timestamp.format(item.endsAt)}</bdi></span><RemoveSchedule shopId={shopId} barberId={barberId} id={item.id} kind="timeOff" /></li>)}</ul>
    <ScheduleEditor shopId={shopId} barberId={barberId} mode="timeOff" />
    <h5>{t.schedulePreview}</h5><p className="field-note">{t.schedulePreviewNote}</p><SchedulePreview shopId={shopId} barberId={barberId} revision={revision} />
  </details>;
}

export async function ClosurePanel({ principal, shopId, locale }: { principal: StaffPrincipal; shopId: string; locale: Locale }) {
  const saved = await createBarberSchedules(getDatabase()).listClosures(principal, shopId);
  const t = messages[locale];
  return <section className="team-management"><h3>{t.scheduleClosures}</h3><p className="field-note">{t.scheduleClosureNote} <bdi>{saved.timeZone}</bdi></p>
    <ul className="managed-services">{saved.closures.map(row => <li key={row.id}><bdi>{row.date.toISOString().slice(0, 10)}</bdi><ClosureForm shopId={shopId} closure={{ id: row.id, date: row.date.toISOString().slice(0, 10) }} /></li>)}</ul>
    <ClosureForm shopId={shopId} />
  </section>;
}
