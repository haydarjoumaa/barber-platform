/* eslint-disable @next/next/no-img-element -- Serve the current logo directly so withdrawal is not hidden by an image-optimizer cache. */
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClientBookings, createMediaRepository, getDatabase } from "@barber/database";
import { LOCALE_COOKIE, messages, resolveLocale, shopCalendarDate } from "@barber/shared";
import { clientAccounts, clientShop, clientToken } from "../client-server";
import { ClientBookingForm } from "../client-booking-form";

export default async function ShopPage({ params, searchParams }: { params: Promise<{ shopSlug: string }>; searchParams: Promise<{ galleryPage?: string }> }) {
  const { shopSlug } = await params;
  const shop = await clientShop(shopSlug);
  if (!shop) notFound();
  const catalog = await createClientBookings(getDatabase()).storefront(shopSlug);
  const client = await clientAccounts().authenticate(shopSlug, await clientToken(shop.id));
  const t = messages[resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value)];
  const gallery = await createMediaRepository(getDatabase()).publicGallery(shopSlug, Number((await searchParams).galleryPage) || 1);
  return <section className="setup-panel" style={{ borderTop: `5px solid ${shop.brandColor}` }}>{shop.mediaAssets.length > 0 && <img className="shop-logo" src={`/${shopSlug}/logo`} width={128} height={128} alt={shop.name} />}<h1>{shop.name}</h1>{shop.description && <p style={{ whiteSpace: "pre-wrap" }}>{shop.description}</p>}{shop.address && <p style={{ whiteSpace: "pre-wrap" }}>{shop.address}</p>}{shop.phone && <p><a href={`tel:${shop.phone}`}><bdi>{shop.phone}</bdi></a></p>}{(shop.websiteUrl || shop.instagramUrl || shop.facebookUrl) && <nav className="account-header-actions" aria-label={t.shopLinks}>
    {(["websiteUrl", "instagramUrl", "facebookUrl"] as const).map(key => shop[key] && <a key={key} href={shop[key]} target="_blank" rel="noopener noreferrer">{t[key]}</a>)}
  </nav>}<ClientBookingForm slug={shopSlug} services={catalog.services} barbers={catalog.barbers} today={shopCalendarDate(new Date(), shop.timeZone)} signedIn={Boolean(client)} />
    {gallery.total > 0 && <section id="shop-gallery" className="media-manager"><h2>{t.mediaShopGallery}</h2><ul className="media-gallery">{gallery.assets.map(asset => <li key={asset.id}><a href={`/${shopSlug}/gallery/${asset.id}`} target="_blank" rel="noreferrer"><img src={`/${shopSlug}/gallery/${asset.id}`} width={asset.width} height={asset.height} alt={asset.caption || `${shop.name} — ${t.mediaShopGallery}`} loading="lazy" /></a>{asset.caption && <p>{asset.caption}</p>}</li>)}</ul>
      {gallery.pages > 1 && <nav className="account-header-actions" aria-label={t.mediaShopGallery}>{gallery.page > 1 && <a href={`/${shopSlug}?galleryPage=${gallery.page - 1}#shop-gallery`}>{t.clientPreviousPage}</a>}<span>{t.clientPage} {gallery.page} / {gallery.pages}</span>{gallery.page < gallery.pages && <a href={`/${shopSlug}?galleryPage=${gallery.page + 1}#shop-gallery`}>{t.clientNextPage}</a>}</nav>}
    </section>}
  </section>;
}
