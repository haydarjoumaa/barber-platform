import type { StaffPrincipal } from "@barber/auth";
import { resolveClosureDate } from "@barber/shared";
import type { PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createShopPayments(database: PrismaClient) {
  return {
    record(principal: StaffPrincipal | null, shopId: string, appointmentId: string) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        if (!uuid.test(appointmentId)) throw new Error("Invalid appointment");
        const appointment = await tx.appointment.findUnique({ where: { barbershopId_id: { barbershopId: shopId, id: appointmentId } }, select: { services: { select: { priceMinor: true, currency: true } } } });
        const currency = appointment?.services[0]?.currency;
        if (!appointment || !currency || appointment.services.some(service => service.currency !== currency)) throw new Error("Saved service prices required");
        if (await tx.payment.findFirst({ where: { barbershopId: shopId, appointmentId, voidedAt: null } })) throw new Error("Already paid");
        const amountMinor = appointment.services.reduce((sum, service) => sum + BigInt(service.priceMinor), 0n);
        const payment = await tx.payment.create({ data: { barbershopId: shopId, appointmentId, recordedBy: actorUserId, amountMinor, currency } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "payment.recorded", details: { paymentId: payment.id, appointmentId, amountMinor: amountMinor.toString(), currency } } });
        return { id: payment.id };
      });
    },
    void(principal: StaffPrincipal | null, shopId: string, paymentId: string, reason: string) {
      return withShopOwner(database, principal, shopId, async (tx, _shop, actorUserId) => {
        if (!uuid.test(paymentId) || typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) throw new Error("Invalid correction");
        const changed = await tx.payment.updateMany({ where: { barbershopId: shopId, id: paymentId, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
        if (changed.count !== 1) throw new Error("Payment changed");
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "payment.voided", details: { paymentId, reason: reason.trim() } } });
      });
    },
    report(principal: StaffPrincipal | null, shopId: string, from: string, to: string) {
      return withShopOwner(database, principal, shopId, async (tx, shop) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Invalid date range");
        const start = new Date(resolveClosureDate(from, shop.time_zone).start);
        const end = new Date(resolveClosureDate(to, shop.time_zone).end);
        if (start >= end) throw new Error("Invalid date range");
        const revenue = await tx.$queryRaw<{ barberId: string; barberName: string; currency: string; amountMinor: string; receipts: number }[]>`
          SELECT b.id AS "barberId", b.display_name AS "barberName", p.currency,
            SUM(p.amount_minor)::text AS "amountMinor", COUNT(*)::integer AS receipts
          FROM payments p JOIN appointments a ON a.barbershop_id = p.barbershop_id AND a.id = p.appointment_id
          JOIN barbers b ON b.barbershop_id = a.barbershop_id AND b.id = a.barber_id
          WHERE p.barbershop_id = ${shopId}::uuid AND p.voided_at IS NULL AND p.created_at >= ${start} AND p.created_at < ${end}
          GROUP BY b.id, b.display_name, p.currency ORDER BY b.display_name, b.id, p.currency`;
        const statuses = await tx.appointment.groupBy({ by: ["status"], where: { barbershopId: shopId, startsAt: { gte: start, lt: end } }, _count: { _all: true } });
        return { from, to, timeZone: shop.time_zone, revenue, statuses: statuses.map(row => ({ status: row.status, count: row._count._all })) };
      });
    },
  };
}
