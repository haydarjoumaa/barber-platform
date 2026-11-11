"use client";
import { useActionState } from "react";
import { PUBLICATION_REQUIREMENTS, type PublicationRequirement } from "@barber/shared";
import { useLocale } from "@barber/ui";
import { savePublication } from "./publication-actions";

const requirementLabel = {
  name: "publishNeedName", slug: "publishNeedSlug", phone: "publishNeedPhone", address: "publishNeedAddress", timeZone: "publishNeedTimeZone",
  currency: "publishNeedCurrency", services: "publishNeedServices", barbers: "publishNeedBarbers", policy: "publishNeedPolicy",
} as const;

export function PublicationPanel({ shopId, slug, publishedAt, gaps, clientOrigin }: { shopId: string; slug: string; publishedAt: string | null; gaps: PublicationRequirement[]; clientOrigin: string | null }) {
  const { t } = useLocale();
  const [state, action, pending] = useActionState(savePublication, {});
  const published = Boolean(publishedAt);
  return <section className="account-form" aria-labelledby={`publication-${shopId}`}>
    <h3 id={`publication-${shopId}`}>{t("publishTitle")}</h3>
    <p className="panel-description">{t(published ? (gaps.length ? "publishLiveIncomplete" : "publishLiveNote") : "publishDraftNote")}</p>
    {published && clientOrigin && <p><a href={`${clientOrigin}/${slug}`} target="_blank" rel="noreferrer"><bdi dir="ltr">{`${clientOrigin}/${slug}`}</bdi></a></p>}
    <ul className="publication-checklist">{PUBLICATION_REQUIREMENTS.map(requirement => {
      const met = !gaps.includes(requirement);
      return <li key={requirement} data-met={met}><span role="img" aria-label={t(met ? "publishMet" : "publishMissing")}>{met ? "✓" : "○"}</span> {t(requirementLabel[requirement])}</li>;
    })}</ul>
    <form action={action}>
      <input type="hidden" name="shopId" value={shopId} /><input type="hidden" name="operation" value={published ? "unpublish" : "publish"} />
      <fieldset disabled={pending || (!published && gaps.length > 0)}>
        <p>{t(published ? "publishUnpublishNote" : "publishPublishNote")}</p>
        <label><input type="checkbox" name="confirm" required />{t("publishConfirm")}</label>
        <button className={published ? "secondary-button" : "primary-button"}>{t(pending ? "authWorking" : published ? "publishUnpublish" : "publishPublish")}</button>
      </fieldset>
      {state.error && <p role="alert">{t(state.error)}</p>}
      {state.published !== undefined && !state.error && <p role="status">{t(state.published ? "publishDone" : "unpublishDone")}</p>}
    </form>
  </section>;
}
