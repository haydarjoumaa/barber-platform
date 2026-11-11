import type { StaffPrincipal } from "@barber/auth";
import type { PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";

export interface ShopDetailsInput { phone: string; address: string; description: string; brandColor: string; websiteUrl?: string; instagramUrl?: string; facebookUrl?: string; }
function publicLink(value: string | undefined, hosts?: string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("Invalid link");
  if (!value.trim()) return null;
  if (value.trim().length > 500) throw new Error("Invalid link");
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password || (hosts && !hosts.includes(url.hostname))) throw new Error("Invalid link");
  if (url.href.length > 500) throw new Error("Invalid link");
  return url.href;
}
export function createShopDetails(database: PrismaClient) {
  return {
    update(principal: StaffPrincipal | null, shopId: string, input: ShopDetailsInput, expectedUpdatedAt: string) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        const phone = input.phone.trim(), address = input.address.trim(), description = input.description.trim();
        if ((phone && !/^\+[1-9]\d{7,14}$/.test(phone)) || address.length > 500 || description.length > 2000 || !/^#[0-9a-fA-F]{6}$/.test(input.brandColor)) throw new Error("Invalid profile");
        const before = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { phone: true, address: true, description: true, brandColor: true, updatedAt: true } });
        if (before.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Profile changed");
        const links = { websiteUrl: publicLink(input.websiteUrl), instagramUrl: publicLink(input.instagramUrl, ["instagram.com", "www.instagram.com"]), facebookUrl: publicLink(input.facebookUrl, ["facebook.com", "www.facebook.com", "m.facebook.com"]) };
        const data = { ...(links.websiteUrl !== undefined ? { websiteUrl: links.websiteUrl } : {}), ...(links.instagramUrl !== undefined ? { instagramUrl: links.instagramUrl } : {}), ...(links.facebookUrl !== undefined ? { facebookUrl: links.facebookUrl } : {}), phone: phone || null, address: address || null, description: description || null, brandColor: input.brandColor.toLowerCase() };
        const saved = await tx.barbershop.update({ where: { id: shopId }, data, select: { updatedAt: true } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "shop.details_updated", details: { fields: ["phone", "address", "description", "brandColor", ...Object.keys(links).filter(key => links[key as keyof typeof links] !== undefined)] } } });
        return { ...data, updatedAt: saved.updatedAt.toISOString() };
      });
    },
  };
}
