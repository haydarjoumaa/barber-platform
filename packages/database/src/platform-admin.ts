import type { StaffPrincipal } from "@barber/auth";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

export function createPlatformAdministration(db: PrismaClient) {
  async function authorized<T>(principal: StaffPrincipal | null, operation: (tx: Prisma.TransactionClient, actorUserId: string) => Promise<T>) {
    if (!principal) throw new Error("Forbidden");
    return db.$transaction(async tx => {
      const [admin] = await tx.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM platform_admins WHERE user_id = ${principal.userId}::uuid FOR SHARE`;
      if (!admin) throw new Error("Forbidden");
      return operation(tx, principal.userId);
    });
  }
  return {
    list(principal: StaffPrincipal | null, pageInput = 1) {
      return authorized(principal, async (tx, actorUserId) => {
        const total = await tx.barbershop.count(), pages = Math.max(1, Math.ceil(total / 25));
        const page = Math.min(Number.isSafeInteger(pageInput) && pageInput > 0 ? pageInput : 1, pages);
        const shops = await tx.barbershop.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
          select: { id: true, name: true, slug: true, publishedAt: true, suspendedAt: true, deletedAt: true, createdAt: true } });
        await tx.platformAuditEvent.create({ data: { actorUserId, event: "platform.shops_viewed", details: { page } } });
        return { shops, total, page, pages };
      });
    },
    support(principal: StaffPrincipal | null, shopId: string) {
      return authorized(principal, async (tx, actorUserId) => {
        if (!/^[0-9a-f-]{36}$/i.test(shopId)) throw new Error("Invalid shop");
        const shop = await tx.barbershop.findUnique({ where: { id: shopId }, select: { id: true, name: true, slug: true, phone: true, address: true, timeZone: true, currency: true, publishedAt: true, suspendedAt: true, deletedAt: true,
          _count: { select: { clients: true, appointments: true, barbers: true, services: true } } } });
        if (!shop) return null;
        await tx.platformAuditEvent.create({ data: { actorUserId, event: "platform.support_viewed", details: { shopId } } });
        const appointments = await tx.appointment.findMany({ where: { barbershopId: shopId }, orderBy: [{ startsAt: "desc" }, { id: "desc" }], take: 25,
          select: { id: true, startsAt: true, status: true, barber: { select: { displayName: true } }, client: { select: { name: true } }, guestName: true } });
        return { shop, appointments };
      });
    },
    suspend(principal: StaffPrincipal | null, shopId: string, suspend: boolean, reason: string) {
      return authorized(principal, async (tx, actorUserId) => {
        if (!/^[0-9a-f-]{36}$/i.test(shopId) || typeof suspend !== "boolean" || !reason.trim() || reason.trim().length > 500) throw new Error("Invalid suspension");
        const changed = await tx.barbershop.updateMany({ where: { id: shopId, deletedAt: null, suspendedAt: suspend ? null : { not: null } }, data: { suspendedAt: suspend ? new Date() : null } });
        if (changed.count !== 1) throw new Error("Shop changed");
        await tx.platformAuditEvent.create({ data: { actorUserId, event: suspend ? "platform.shop_suspended" : "platform.shop_reactivated", details: { shopId, reason: reason.trim() } } });
      });
    },
  };
}
