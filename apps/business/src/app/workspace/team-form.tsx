"use client";
import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import { saveTeam } from "./team-actions";

export function StaffInviteForm({ shopId }: { shopId: string }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(saveTeam, {});
  const [show, setShow] = useState(true);
  return <form action={action} className="account-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="invite" />
    <fieldset disabled={pending}><legend>{t("teamInvite")}</legend><p>{t("teamPermissionNote")}</p>
      <label>{t("authEmail")}<input name="email" type="email" required maxLength={254} /></label><label>{t("teamDisplayName")}<input name="displayName" required maxLength={100} /></label>
      <label>{t("teamRole")}<select name="role" defaultValue="BARBER"><option value="BARBER">{t("bookingBarber")}</option><option value="RECEPTIONIST">{t("teamReceptionist")}</option></select></label>
      <label><input type="checkbox" name="manageAppointments" />{t("teamManageAppointments")}</label><label><input type="checkbox" name="manageSchedules" />{t("teamManageSchedules")}</label>
      <button className="primary-button" onClick={() => setShow(true)}>{t(pending ? "authWorking" : "teamInvite")}</button>
    </fieldset>{state.error && <p role="alert">{t(state.error)}</p>}
    {state.code && show && <section role="status"><p>{t("teamInviteCodeNote")}</p><p><a href={`/join#code=${state.code}`} target="_blank" rel="noreferrer">{t("teamJoinLink")}</a></p><code dir="ltr" style={{ overflowWrap: "anywhere" }}>{state.code}</code><p><bdi>{state.expiresAt}</bdi></p><button type="button" className="secondary-button" onClick={() => setShow(false)}>{t("clientHideCode")}</button></section>}
  </form>;
}
export function StaffPermissionsForm({ shopId, member }: { shopId: string; member: { id: string; manageAppointments: boolean; manageSchedules: boolean } }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(saveTeam, {});
  return <form action={action} className="account-form"><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="permissions" /><input type="hidden" name="id" value={member.id} />
    <fieldset disabled={pending}><label><input type="checkbox" name="manageAppointments" defaultChecked={member.manageAppointments} />{t("teamManageAppointments")}</label><label><input type="checkbox" name="manageSchedules" defaultChecked={member.manageSchedules} />{t("teamManageSchedules")}</label><button className="secondary-button">{t("serviceSave")}</button></fieldset>
    {state.error && <p role="alert">{t(state.error)}</p>}{state.success && <p role="status">{t("teamSaved")}</p>}
  </form>;
}
export function RevokeInvite({ shopId, id }: { shopId: string; id: string }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(saveTeam, {});
  return <form action={action}><input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value="revoke" /><input type="hidden" name="id" value={id} /><button className="secondary-button" disabled={pending}>{t("teamRevoke")}</button>{state.error && <p role="alert">{t(state.error)}</p>}</form>;
}
