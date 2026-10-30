/* eslint-disable @next/next/no-img-element -- Serve the current logo directly so withdrawal is not hidden by an image-optimizer cache. */
import { notFound } from "next/navigation";
import { createClientBookings, getDatabase } from "@barber/database";
import { shopCalendarDate } from "@barber/shared";
import { clientAccounts, clientShop, clientToken } from "../client-server";
import { ClientBookingForm } from "../client-booking-form";

export default async function ShopPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  const shop = await clientShop(shopSlug);
  if (!shop) notFound();
  const catalog = await createClientBookings(getDatabase()).storefront(shopSlug);
  const client = await clientAccounts().authenticate(shopSlug, await clientToken(shop.id));
  return <section className="setup-panel" style={{ borderTop: `5px solid ${shop.brandColor}` }}>{shop.mediaAssets.length > 0 && <img className="shop-logo" src={`/${shopSlug}/logo`} width={128} height={128} alt={shop.name} />}<h1>{shop.name}</h1>{shop.description && <p style={{ whiteSpace: "pre-wrap" }}>{shop.description}</p>}{shop.address && <p style={{ whiteSpace: "pre-wrap" }}>{shop.address}</p>}{shop.phone && <p><a href={`tel:${shop.phone}`}><bdi>{shop.phone}</bdi></a></p>}<ClientBookingForm slug={shopSlug} services={catalog.services} barbers={catalog.barbers} today={shopCalendarDate(new Date(), shop.timeZone)} signedIn={Boolean(client)} /></section>;
}
