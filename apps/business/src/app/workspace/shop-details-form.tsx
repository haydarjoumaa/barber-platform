"use client";
import { useActionState, useState } from "react";
import { useLocale } from "@barber/ui";
import { saveShopDetails } from "./shop-details-actions";

export function ShopDetailsForm({ shop }: { shop: { id: string; phone: string | null; address: string | null; description: string | null; brandColor: string; websiteUrl: string | null; instagramUrl: string | null; facebookUrl: string | null; updatedAt: string } }) {
  const { t } = useLocale();
  const [initialVersion] = useState(shop.updatedAt);
  const [state, action, pending] = useActionState(saveShopDetails, {});
  return <details><summary>{t("shopDetailsTitle")}</summary><form action={action} className="account-form">
    <input type="hidden" name="shopId" value={shop.id} /><input type="hidden" name="expectedUpdatedAt" value={state.updatedAt ?? initialVersion} />
    <fieldset disabled={pending}>
      <label>{t("shopPhone")}<input name="phone" type="tel" maxLength={16} pattern="\+[1-9][0-9]{7,14}" dir="ltr" defaultValue={shop.phone ?? ""} /></label>
      <label>{t("shopAddress")}<textarea name="address" maxLength={500} defaultValue={shop.address ?? ""} /></label>
      <label>{t("shopDescription")}<textarea name="description" maxLength={2000} defaultValue={shop.description ?? ""} /></label>
      <label>{t("shopColor")}<input name="brandColor" type="color" required defaultValue={shop.brandColor} /></label>
      {(["websiteUrl", "instagramUrl", "facebookUrl"] as const).map(key => <label key={key}>{t(key)}<input name={key} type="url" maxLength={500} placeholder="https://" dir="ltr" defaultValue={shop[key] ?? ""} /></label>)}
      <p className="field-note">{t("shopLinksNote")}</p>
      <button className="primary-button">{t(pending ? "authWorking" : "serviceSave")}</button>
    </fieldset>{state.error && <p role="alert">{t(state.error)}</p>}{state.updatedAt && <p role="status">{t("shopProfileSaved")}</p>}
  </form></details>;
}
