import type { StaffPrincipal } from "@barber/auth";
import type { PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";

export interface ShopDetailsInput { phone: string; address: string; description: string; brandColor: string; }
export function createShopDetails(database: PrismaClient) {
  return {
    update(principal: StaffPrincipal | null, shopId: string, input: ShopDetailsInput, expectedUpdatedAt: string) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        const phone = input.phone.trim(), address = input.address.trim(), description = input.description.trim();
        if ((phone && !/^\+[1-9]\d{7,14}$/.test(phone)) || address.length > 500 || description.length > 2000 || !/^#[0-9a-fA-F]{6}$/.test(input.brandColor)) throw new Error("Invalid profile");
        const before = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { phone: true, address: true, description: true, brandColor: true, updatedAt: true } });
        if (before.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error("Profile changed");
        const data = { phone: phone || null, address: address || null, description: description || null, brandColor: input.brandColor.toLowerCase() };
        const saved = await tx.barbershop.update({ where: { id: shopId }, data, select: { updatedAt: true } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "shop.details_updated", details: { fields: ["phone", "address", "description", "brandColor"] } } });
        return { ...data, updatedAt: saved.updatedAt.toISOString() };
      });
    },
  };
}
