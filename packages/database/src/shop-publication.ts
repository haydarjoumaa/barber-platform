import type { StaffPrincipal } from "@barber/auth";
import { publicationGaps, type PublicationRequirement } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";

export class PublicationIncompleteError extends Error {
  constructor(public readonly gaps: PublicationRequirement[]) { super("Publication requirements missing"); }
}

async function readiness(tx: Prisma.TransactionClient, shopId: string) {
  const shop = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true, slug: true, phone: true, address: true, timeZone: true, currency: true, publishedAt: true } });
  const [activeServiceCount, bookableBarberCount, policy] = await Promise.all([
    tx.service.count({ where: { barbershopId: shopId, archivedAt: null } }),
    tx.barber.count({ where: { barbershopId: shopId, membership: { accessDisabledAt: null },
      services: { some: { service: { archivedAt: null } } }, schedulePeriods: { some: { kind: "WORK" } } } }),
    tx.shopBookingPolicy.findUnique({ where: { barbershopId: shopId }, select: { barbershopId: true } }),
  ]);
  const gaps = publicationGaps({ ...shop, activeServiceCount, bookableBarberCount, hasBookingPolicy: Boolean(policy) });
  return { publishedAt: shop.publishedAt, gaps };
}

export function createShopPublication(database: PrismaClient) {
  return {
    /** Owner checklist. A published shop can later become incomplete; the panel reports this without unpublishing. */
    status(principal: StaffPrincipal | null, shopId: string) {
      return withShopOwner(database, principal, shopId, tx => readiness(tx, shopId));
    },
    publish(principal: StaffPrincipal | null, shopId: string) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        const current = await readiness(tx, shopId);
        if (current.gaps.length) throw new PublicationIncompleteError(current.gaps);
        if (current.publishedAt) return { publishedAt: current.publishedAt };
        const saved = await tx.barbershop.update({ where: { id: shopId }, data: { publishedAt: new Date() }, select: { publishedAt: true } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "shop.published", details: {} } });
        return saved;
      });
    },
    /** Hides the booking page and blocks client sign-in/booking; existing appointments are preserved. */
    unpublish(principal: StaffPrincipal | null, shopId: string) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        const current = await tx.barbershop.findUniqueOrThrow({ where: { id: shopId }, select: { publishedAt: true } });
        if (!current.publishedAt) return { publishedAt: null };
        await tx.barbershop.update({ where: { id: shopId }, data: { publishedAt: null } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "shop.unpublished", details: { publishedAt: current.publishedAt.toISOString() } } });
        return { publishedAt: null };
      });
    },
  };
}
