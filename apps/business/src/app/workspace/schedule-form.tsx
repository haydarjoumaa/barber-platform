"use client";

import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import type { MessageKey } from "@barber/shared";
import { saveSchedule, type ScheduleFormState } from "./schedule-actions";

function Result({ state }: { state: ScheduleFormState }) {
  const { t } = useLocale();
  return <>{state.error && <p className="form-error" role="alert">{t(state.error)} {state.problem && <bdi>{state.problem}</bdi>}</p>}{state.success && <p role="status">{t("scheduleSaved")}</p>}</>;
}
export function ScheduleEditor({ shopId, barberId, mode }: { shopId: string; barberId: string; mode: "period" | "timeOff" }) {
  const { t, locale } = useLocale();
  const [state, action, pending] = useActionState(saveSchedule, {});
  const [values, setValues] = useState<Record<string, string>>({ dayOfWeek: "1", kind: "WORK", startOffset: "0", endOffset: "0" });
  const value = (name: string) => values[name] ?? "";
  const set = (name: string, next: string) => setValues(previous => ({ ...previous, [name]: next }));
  const input = (name: string, label: MessageKey, type: string) => <label>{t(label)}<input type={type} name={name} required value={value(name)} onChange={event => set(name, event.target.value)} /></label>;
  const select = (name: string, label: MessageKey, options: [string, string][]) => <label>{t(label)}<select name={name} value={value(name)} onChange={event => set(name, event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
  return <form action={action} className="account-form service-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="barberId" value={barberId} /><input type="hidden" name="operation" value={mode} />
    <fieldset disabled={pending}><legend>{t(mode === "period" ? "scheduleAddPeriod" : "scheduleAddTimeOff")}</legend>
      {mode === "period" && <div className="barber-override-fields">
        {select("dayOfWeek", "scheduleWeekday", Array.from({ length: 7 }, (_, index) => [String(index + 1), new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + index)))]))}
        {select("kind", "scheduleKind", [["WORK", t("scheduleWork")], ["BREAK", t("scheduleBreak")]])}
      </div>}
      <div className="barber-override-fields">
        {mode === "timeOff" && input("startDate", "scheduleStartDate", "date")}{mode === "timeOff" && input("endDate", "scheduleEndDate", "date")}
        {input("startTime", "scheduleStart", "time")}{input("endTime", "scheduleEnd", "time")}
        {mode === "period" && select("startOffset", "scheduleStartDay", [["0", t("scheduleSameDay")], ["1", t("scheduleNextDayBreak")]])}
        {mode === "period" && select("endOffset", "scheduleEndDay", [["0", t("scheduleSameDay")], ["1", t("scheduleNextDay")]])}
      </div>
      <details><summary>{t("scheduleDstChoices")}</summary><p className="field-note">{t("scheduleDstNote")}</p><div className="barber-override-fields">
        {select("startOccurrence", "scheduleStart", [["", t("scheduleAsk")], ["earlier", t("scheduleEarlier")], ["later", t("scheduleLater")]])}
        {select("endOccurrence", "scheduleEnd", [["", t("scheduleAsk")], ["earlier", t("scheduleEarlier")], ["later", t("scheduleLater")]])}
      </div></details>
      <button className="primary-button" disabled={pending}>{t(pending ? "authWorking" : "serviceSave")}</button>
    </fieldset><Result state={state} />
  </form>;
}

export function RemoveSchedule({ shopId, barberId, id, kind }: { shopId: string; barberId: string; id: string; kind: "period" | "timeOff" | "override" }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(saveSchedule, {});
  return <details><summary>{t(kind === "override" ? "scheduleRestoreWeekly" : "scheduleRemove")}</summary><form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="barberId" value={barberId} /><input type="hidden" name="id" value={id} /><input type="hidden" name="recordKind" value={kind} /><input type="hidden" name="operation" value="remove" />
    <p className="field-note">{t(kind === "override" ? "scheduleRestoreNote" : "scheduleRemoveNote")}</p><button className="secondary-button" disabled={pending}>{t(pending ? "authWorking" : "barberConfirmRemove")}</button><Result state={state} />
  </form></details>;
}

export function SchedulePreview({ shopId, barberId, revision }: { shopId: string; barberId: string; revision: string }) {
  // A new revision remounts the preview so mutations cannot leave stale intervals visible.
  return <PreviewForm key={revision} shopId={shopId} barberId={barberId} />;
}
function PreviewForm({ shopId, barberId }: { shopId: string; barberId: string }) {
  const { t, locale } = useLocale();
  const [state, action, pending] = useActionState(saveSchedule, {});
  return <form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="barberId" value={barberId} /><input type="hidden" name="operation" value="preview" />
    <label>{t("selectDate")}<input name="date" type="date" required /></label><button className="secondary-button" disabled={pending}>{t(pending ? "authWorking" : "schedulePreview")}</button><Result state={state} />
    {state.preview && <div role="status"><p><bdi>{state.preview.date} · {state.preview.timeZone}</bdi></p>{(["working", "unavailable"] as const).map(kind => <section key={kind}><h5>{t(kind === "working" ? "scheduleWork" : "scheduleBlocked")}</h5>{state.preview![kind].length ? <ul>{state.preview![kind].map((interval, index) => <li key={index}><bdi>{new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset", timeZone: state.preview!.timeZone }).format(interval.start)} – {new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset", timeZone: state.preview!.timeZone }).format(interval.end)}</bdi></li>)}</ul> : <p>{t("scheduleNone")}</p>}</section>)}</div>}
  </form>;
}
