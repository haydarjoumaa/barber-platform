import type { StaffPrincipal } from "@barber/auth";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

export interface StaffAccess { owner: boolean; barberId: string | null; }
export async function withStaffAccess<T>(db: PrismaClient, principal: StaffPrincipal | null, shopId: string, permission: "appointments" | "schedules",
  operation: (tx: Prisma.TransactionClient, shop: { currency: string | null; time_zone: string }, actor: string, access: StaffAccess) => Promise<T>): Promise<T> {
  if (!principal || !principal.memberships.some(member => member.barbershopId === shopId)) throw new Error("Forbidden");
  return db.$transaction(async tx => {
    const [record] = await tx.$queryRaw<{ currency: string | null; time_zone: string; role: string; membership_id: string; manage_appointments: boolean; manage_schedules: boolean }[]>`
      SELECT s.currency, s.time_zone, m.role, m.id AS membership_id, m.manage_appointments, m.manage_schedules
      FROM barbershops s JOIN shop_memberships m ON m.barbershop_id = s.id
      WHERE s.id = ${shopId}::uuid AND m.user_id = ${principal.userId}::uuid AND s.deleted_at IS NULL AND s.suspended_at IS NULL FOR UPDATE OF s, m`;
    if (!record) throw new Error("Forbidden");
    if (record.role === "OWNER") return operation(tx, record, principal.userId, { owner: true, barberId: null });
    if (!(permission === "appointments" ? record.manage_appointments : record.manage_schedules)) throw new Error("Forbidden");
    if (record.role === "RECEPTIONIST") return operation(tx, record, principal.userId, { owner: false, barberId: null });
    if (record.role !== "BARBER") throw new Error("Forbidden");
    const barber = await tx.barber.findUnique({ where: { barbershopId_membershipId: { barbershopId: shopId, membershipId: record.membership_id } }, select: { id: true } });
    if (!barber) throw new Error("Forbidden");
    return operation(tx, record, principal.userId, { owner: false, barberId: barber.id });
  });
}
