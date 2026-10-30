import type { StaffPrincipal } from "@barber/auth";
import { isValidShopSlug } from "@barber/shared";
import type { PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";

export interface ShopProfileInput { name: string; slug: string; }
export class ShopProfileError extends Error {
  constructor(public readonly code: "INVALID" | "STALE" | "SLUG_TAKEN") { super(code); }
}

export function createShopProfiles(database: PrismaClient) {
  return {
    async update(principal: StaffPrincipal | null, shopId: string, input: ShopProfileInput, expected: ShopProfileInput) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100 ||
          typeof input.slug !== "string" || !isValidShopSlug(input.slug.trim()) ||
          typeof expected.name !== "string" || typeof expected.slug !== "string") throw new ShopProfileError("INVALID");
        const data = { name: input.name.trim(), slug: input.slug.trim() };
        const previous = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true, slug: true } });
        if (previous.name !== expected.name || previous.slug !== expected.slug) throw new ShopProfileError("STALE");
        if (previous.name === data.name && previous.slug === data.slug) return previous;
        await tx.barbershop.update({ where: { id: shopId }, data });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "shop.profile_updated", details: { before: previous, after: data } } });
        return data;
      }).catch(error => {
        // The unique index arbitrates slug races, including against new registrations.
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ShopProfileError("SLUG_TAKEN");
        throw error;
      });
    },
  };
}
