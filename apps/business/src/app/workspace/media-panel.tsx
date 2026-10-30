import type { StaffPrincipal } from "@barber/auth";
import { createMediaRepository, getDatabase } from "@barber/database";
import { messages, type Locale } from "@barber/shared";
import { MediaManager } from "@barber/ui";
import { saveOwnerMedia } from "./media-actions";

export async function OwnerMediaPanel({ principal, shopId, clientId = null, locale, timeZone, page = 1, query = "" }: {
  principal: StaffPrincipal; shopId: string; clientId?: string | null; locale: Locale; timeZone: string; page?: number; query?: string;
}) {
  const result = await createMediaRepository(getDatabase()).ownerList(principal, shopId, clientId, page);
  function link(page: number) { const params = new URLSearchParams(query); params.set("photoPage", String(page)); return `?${params}#photos-${clientId ?? shopId}`; }
  return <details id={`photos-${clientId ?? shopId}`} className="team-management"><summary>{messages[locale][clientId ? "mediaPhotos" : "mediaLogo"]}</summary>
    <MediaManager mode={clientId ? "owner" : "logo"} action={saveOwnerMedia.bind(null, shopId, clientId)} timeZone={timeZone}
      assets={result.assets.map(asset => ({ ...asset, src: `/api/v1/media/${asset.id}?shopId=${shopId}` }))}
      pagination={{ page: result.page, pages: result.pages, total: result.total, previousHref: result.page > 1 ? link(result.page - 1) : null, nextHref: result.page < result.pages ? link(result.page + 1) : null }} />
  </details>;
}
