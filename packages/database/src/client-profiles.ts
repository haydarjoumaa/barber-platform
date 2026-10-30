import type { StaffPrincipal } from "@barber/auth";
import type { PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";

export const CLIENT_HISTORY_PAGE_SIZE = 20;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read-only owner view. A matching phone in another shop never joins this history. */
export function createClientProfiles(database: PrismaClient) {
  return {
    get(principal: StaffPrincipal | null, shopId: string, clientId: string, requestedPage = 1) {
      if (!uuid.test(clientId) || !Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new Error("Invalid client history request");
      return withShopOwner(database, principal, shopId, async (tx, shop) => {
        const client = await tx.client.findUnique({
          where: { barbershopId_id: { barbershopId: shopId, id: clientId } },
          select: { id: true, name: true, phone: true, email: true, createdAt: true,
            barbershop: { select: { name: true } } },
        });
        if (!client) return null;
        const where = { barbershopId: shopId, clientId };
        const total = await tx.appointment.count({ where });
        const pages = Math.max(1, Math.ceil(total / CLIENT_HISTORY_PAGE_SIZE));
        const page = Math.min(requestedPage, pages);
        const appointments = await tx.appointment.findMany({
          where, orderBy: [{ startsAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * CLIENT_HISTORY_PAGE_SIZE, take: CLIENT_HISTORY_PAGE_SIZE,
          select: { id: true, startsAt: true, serviceEndsAt: true, status: true,
            barber: { select: { displayName: true } },
            payments: { where: { voidedAt: null }, select: { id: true, amountMinor: true, currency: true, createdAt: true } },
          services: { orderBy: { position: "asc" }, select: { name: true, priceMinor: true, currency: true } } },
        });
        return { client, appointments, total, page, pages, timeZone: shop.time_zone };
      });
    },
  };
}
