"use client";

import { useActionState, useState } from "react";
import { scheduleClock, type SchedulePeriodInput } from "@barber/shared";
import { useLocale } from "@barber/ui";
import { saveSchedule, type ScheduleFormState } from "./schedule-actions";

function Result({ state }: { state: ScheduleFormState }) {
  const { t } = useLocale();
  return <>{state.error && <p role="alert" className="form-error">{t(state.error)} {state.problem && <bdi>{state.problem}</bdi>}</p>}{state.success && <p role="status">{t("scheduleSaved")}</p>}</>;
}
interface Row { kind: "WORK" | "BREAK"; start: string; end: string; startOffset: number; endOffset: number; startOccurrence: "" | "earlier" | "later"; endOccurrence: "" | "earlier" | "later"; }
export function OverrideForm({ shopId, barberId, date = "", periods = [] }: { shopId: string; barberId: string; date?: string; periods?: SchedulePeriodInput[] }) {
  const { t } = useLocale();
  const [selectedDate, setSelectedDate] = useState(date);
  const [rows, setRows] = useState<Row[]>(() => periods.map(period => ({ kind: period.kind, start: scheduleClock(period.startMinute), end: scheduleClock(period.endMinute), startOffset: Math.floor(period.startMinute / 1440), endOffset: Math.floor(period.endMinute / 1440), startOccurrence: period.startOccurrence ?? "", endOccurrence: period.endOccurrence ?? "" })));
  const [state, action, pending] = useActionState(saveSchedule, {});
  const update = (index: number, change: Partial<Row>) => setRows(previous => previous.map((row, i) => i === index ? { ...row, ...change } : row));
  const minutes = (clock: string, offset: number) => clock ? Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3)) + offset * 1440 : -1;
  const input = rows.map(row => ({ dayOfWeek: 1, kind: row.kind, startMinute: minutes(row.start, row.startOffset), endMinute: minutes(row.end, row.endOffset), startOccurrence: row.startOccurrence || null, endOccurrence: row.endOccurrence || null }));
  return <form action={action} className="account-form service-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="barberId" value={barberId} /><input type="hidden" name="operation" value="override" /><input type="hidden" name="periods" value={JSON.stringify(input)} />
    <fieldset disabled={pending}><legend>{t("scheduleOverrideEdit")}</legend>
      <label>{t("selectDate")}<input name="date" type="date" required value={selectedDate} readOnly={Boolean(date)} onChange={event => setSelectedDate(event.target.value)} /></label>
      <p className="field-note">{t("scheduleOverrideNote")}</p>
      {rows.length === 0 && <p>{t("scheduleNoShiftStarts")}</p>}
      {rows.map((row, index) => <fieldset className="override-row" key={index}><legend>{t(row.kind === "WORK" ? "scheduleWork" : "scheduleBreak")} {index + 1}</legend><div className="barber-override-fields">
        <label>{t("scheduleKind")}<select value={row.kind} onChange={event => update(index, { kind: event.target.value as Row["kind"] })}><option value="WORK">{t("scheduleWork")}</option><option value="BREAK">{t("scheduleBreak")}</option></select></label>
        <label>{t("scheduleStart")}<input type="time" required value={row.start} onChange={event => update(index, { start: event.target.value })} /></label>
        <label>{t("scheduleEnd")}<input type="time" required value={row.end} onChange={event => update(index, { end: event.target.value })} /></label>
        <label>{t("scheduleStartDay")}<select value={row.startOffset} onChange={event => update(index, { startOffset: Number(event.target.value) })}><option value={0}>{t("scheduleSameDay")}</option><option value={1}>{t("scheduleNextDayBreak")}</option></select></label>
        <label>{t("scheduleEndDay")}<select value={row.endOffset} onChange={event => update(index, { endOffset: Number(event.target.value) })}><option value={0}>{t("scheduleSameDay")}</option><option value={1}>{t("scheduleNextDay")}</option></select></label>
      </div><details><summary>{t("scheduleDstChoices")}</summary><p className="field-note">{t("scheduleDstNote")}</p><div className="barber-override-fields">{(["startOccurrence", "endOccurrence"] as const).map(key => <label key={key}>{t(key === "startOccurrence" ? "scheduleStart" : "scheduleEnd")}<select value={row[key]} onChange={event => update(index, { [key]: event.target.value })}><option value="">{t("scheduleAsk")}</option><option value="earlier">{t("scheduleEarlier")}</option><option value="later">{t("scheduleLater")}</option></select></label>)}</div></details>
        <button type="button" className="secondary-button" onClick={() => setRows(previous => previous.filter((_, i) => i !== index))}>{t("scheduleRemoveDraft")}</button>
      </fieldset>)}
      <button type="button" className="secondary-button" onClick={() => setRows(previous => [...previous, { kind: "WORK", start: "09:00", end: "17:00", startOffset: 0, endOffset: 0, startOccurrence: "", endOccurrence: "" }])}>{t("scheduleAddPeriod")}</button>
      <button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : "serviceSave")}</button>
    </fieldset><Result state={state} />
  </form>;
}

export function ClosureForm({ shopId, closure }: { shopId: string; closure?: { id: string; date: string } }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(saveSchedule, {});
  const [date, setDate] = useState("");
  const form = <form action={action} className="account-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value={closure ? "removeClosure" : "closure"} />
    {closure ? <><input type="hidden" name="id" value={closure.id} /><p>{t("scheduleClosureRemoveNote")}</p></> : <label>{t("selectDate")}<input name="date" type="date" required value={date} onChange={event => setDate(event.target.value)} disabled={pending} /></label>}
    <button className="secondary-button" disabled={pending}>{t(pending ? "authWorking" : closure ? "barberConfirmRemove" : "scheduleAddClosure")}</button><Result state={state} />
  </form>;
  return closure ? <details><summary>{t("scheduleRemoveClosure")}</summary>{form}</details> : form;
}
