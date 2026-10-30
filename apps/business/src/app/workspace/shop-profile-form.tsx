"use client";

import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import { saveShopProfile, type ShopProfileState } from "./shop-actions";

export function ShopProfileForm({ shop }: { shop: { id: string; name: string; slug: string } }) {
  const { t } = useLocale();
  const [expected, setExpected] = useState({ name: shop.name, slug: shop.slug });
  const [name, setName] = useState(shop.name);
  const [slug, setSlug] = useState(shop.slug);
  const [state, action, pending] = useActionState(async (previous: ShopProfileState, form: FormData) => {
    const result = await saveShopProfile(previous, form);
    if (result.saved) { setExpected(result.saved); setName(result.saved.name); setSlug(result.saved.slug); }
    return result;
  }, {});
  return <form action={action} className="account-form service-form">
    <input type="hidden" name="shopId" value={shop.id} />
    <input type="hidden" name="expectedName" value={expected.name} />
    <input type="hidden" name="expectedSlug" value={expected.slug} />
    <fieldset disabled={pending}>
      <legend>{t("shopProfileEdit")}</legend>
      <label>{t("shopProfileName")}<input name="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>{t("shopProfileSlug")}<input name="slug" required minLength={3} maxLength={63} dir="ltr" autoCapitalize="none" spellCheck={false} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={event => setSlug(event.target.value)} /></label>
      <p className="field-note">{t("shopProfileSlugNote")}</p>
      <p><bdi>/{slug}</bdi></p>
      <button className="primary-button">{t(pending ? "authWorking" : "serviceSave")}</button>
    </fieldset>
    {state.error && <p className="form-error" role="alert">{t(state.error)}</p>}
    {state.saved && <p role="status">{t("shopProfileSaved")}</p>}
  </form>;
}
