import { isValidShopSlug } from "./index";

/** Facts about a shop needed to decide whether its client booking page may go live. */
export interface PublicationSnapshot {
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  timeZone: string;
  currency: string | null;
  activeServiceCount: number;
  /** Barbers with active shop access, at least one active service and at least one weekly working period. */
  bookableBarberCount: number;
  hasBookingPolicy: boolean;
}

export const PUBLICATION_REQUIREMENTS = ["name", "slug", "phone", "address", "timeZone", "currency", "services", "barbers", "policy"] as const;
export type PublicationRequirement = typeof PUBLICATION_REQUIREMENTS[number];

function validTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone }); return true; } catch { return false; }
}

/** Requirements still missing, in checklist order. An empty list means the shop may be published. */
export function publicationGaps(shop: PublicationSnapshot): PublicationRequirement[] {
  const met: Record<PublicationRequirement, boolean> = {
    name: shop.name.trim().length > 0,
    slug: isValidShopSlug(shop.slug),
    phone: Boolean(shop.phone?.trim()),
    address: Boolean(shop.address?.trim()),
    timeZone: validTimeZone(shop.timeZone),
    currency: Boolean(shop.currency),
    services: shop.activeServiceCount > 0,
    barbers: shop.bookableBarberCount > 0,
    policy: shop.hasBookingPolicy,
  };
  return PUBLICATION_REQUIREMENTS.filter(requirement => !met[requirement]);
}
