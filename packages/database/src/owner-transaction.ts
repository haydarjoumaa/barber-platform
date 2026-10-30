import { requireShopOwner, type StaffPrincipal } from "@barber/auth";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

/** Keep authorization and shop activation stable through each owner operation. */
export async function withShopOwner<T>(database: PrismaClient, principal: StaffPrincipal | null, barbershopId: string,
  operation: (tx: Prisma.TransactionClient, shop: { currency: string | null; time_zone: string }, actor: string) => Promise<T>): Promise<T> {
  requireShopOwner(principal, barbershopId);
  return database.$transaction(async tx => {
    const [shop] = await tx.$queryRaw<{ currency: string | null; time_zone: string }[]>`
      SELECT s.currency, s.time_zone FROM barbershops s JOIN shop_memberships m ON m.barbershop_id = s.id
      WHERE s.id = ${barbershopId}::uuid AND m.user_id = ${principal!.userId}::uuid
        AND m.role = 'OWNER' AND s.deleted_at IS NULL AND s.suspended_at IS NULL
      FOR UPDATE OF s, m`;
    if (!shop) throw new Error("Forbidden");
    return operation(tx, shop, principal!.userId);
  });
}
