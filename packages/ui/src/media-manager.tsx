"use client";
/* eslint-disable @next/next/no-img-element -- Private image requests must carry the browser session and must bypass public image optimization caches. */
import { useActionState, useRef } from "react";
import type { MediaActionState, MediaPreview } from "@barber/shared";
import { useLocale } from "./locale-provider";

type MediaAction = (state: MediaActionState, form: FormData) => Promise<MediaActionState>;
const kindLabels = { SHOP_LOGO: "mediaLogo", PROFILE: "mediaProfile", HAIRCUT: "mediaHaircut" } as const;

export function MediaManager({ mode, action, assets, timeZone, pagination }: {
  mode: "logo" | "owner" | "client"; action: MediaAction; assets: MediaPreview[]; timeZone: string;
  pagination: { page: number; pages: number; total: number; previousHref: string | null; nextHref: string | null };
}) {
  const { t, locale } = useLocale();
  const ref = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState(async (previous: MediaActionState, form: FormData) => {
    const result = await action(previous, form);
    if (result.success) ref.current?.reset();
    return result;
  }, {});
  const format = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(new Date(value));
  return <section className="media-manager"><h2>{t(mode === "logo" ? "mediaLogo" : "mediaPhotos")}</h2>
    <p>{t(mode === "logo" ? "mediaLogoNote" : "mediaPrivacyNote")}</p><p>{t("mediaFileNote")}</p>
    <form ref={ref} action={submit} className="account-form"><input type="hidden" name="operation" value="upload" />
      <fieldset disabled={pending}>
        {mode === "logo" ? <input type="hidden" name="kind" value="SHOP_LOGO" /> : <label>{t("mediaPurpose")}<select name="kind" defaultValue="PROFILE"><option value="PROFILE">{t("mediaProfile")}</option><option value="HAIRCUT">{t("mediaHaircut")}</option></select></label>}
        <label>{t("mediaChooseFile")}<input type="file" name="image" required accept="image/jpeg,image/png,image/webp" /></label>
        <label><input type="checkbox" name="consent" required />{t(mode === "logo" ? "mediaLogoConsent" : mode === "owner" ? "mediaOwnerConsent" : "mediaClientConsent")}</label>
        <button className="primary-button">{t(pending ? "authWorking" : "mediaUpload")}</button>
      </fieldset>{state.error && <p className="form-error" role="alert">{t(state.error)}</p>}{state.success && <p role="status">{t("mediaSaved")}</p>}
    </form>
    {assets.length ? <ul className="media-gallery">{assets.map(asset => <li key={asset.id}>
      <a href={asset.src} target="_blank" rel="noreferrer"><img src={asset.src} alt={t(kindLabels[asset.kind])} width={asset.width} height={asset.height} loading="lazy" /></a>
      <p>{t(kindLabels[asset.kind])} · <time dateTime={asset.createdAt}>{format(asset.createdAt)}</time></p><p className="field-note">{t("mediaConsentRecorded")}: {format(asset.consentAt)}</p>
      <RemoveImage action={action} id={asset.id} />
    </li>)}</ul> : <p>{t("mediaEmpty")}</p>}
    {pagination.pages > 1 && <nav className="account-header-actions" aria-label={t("mediaPhotos")}>{pagination.previousHref && <a href={pagination.previousHref}>{t("clientPreviousPage")}</a>}<span>{t("clientPage")} {pagination.page} / {pagination.pages}</span>{pagination.nextHref && <a href={pagination.nextHref}>{t("clientNextPage")}</a>}</nav>}
  </section>;
}

function RemoveImage({ action, id }: { action: MediaAction; id: string }) {
  const { t } = useLocale();
  const [state, submit, pending] = useActionState(action, {});
  return <form action={submit}><input type="hidden" name="operation" value="remove" /><input type="hidden" name="assetId" value={id} /><button className="secondary-button" disabled={pending || state.success}>{t("mediaRemove")}</button>{state.error && <p role="alert">{t(state.error)}</p>}</form>;
}
