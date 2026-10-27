import { requireShopOwner, type StaffPrincipal } from "@barber/auth";
import type { BarberServiceOption } from "@barber/shared";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

export interface ServiceInput { name: string; durationMinutes: number; priceMinor: number; }
export interface BarberServiceInput { durationMinutes: number | null; priceMinor: number | null; }

function integer(value: number, minimum: number) {
  if (!Number.isInteger(value) || value < minimum || value > 2_147_483_647) throw new Error("Invalid service amount or duration");
}
function serviceData(input: ServiceInput): ServiceInput {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 100) throw new Error("Invalid service name");
  integer(input.durationMinutes, 1);
  integer(input.priceMinor, 0);
  return { name: input.name.trim(), durationMinutes: input.durationMinutes, priceMinor: input.priceMinor };
}

/** Import through @barber/database in server code. Principals MUST come from verified sessions. */
export function createServiceCatalog(database: PrismaClient) {
  async function withOwner<T>(principal: StaffPrincipal | null, barbershopId: string,
    operation: (tx: Prisma.TransactionClient, currency: string | null, actorUserId: string) => Promise<T>): Promise<T> {
    requireShopOwner(principal, barbershopId);
    return database.$transaction(async tx => {
      // Recheck current database authorization, not just possibly stale session role claims.
      // Serialize owner catalog operations and hold authorization/deactivation stable until commit.
      const [shop] = await tx.$queryRaw<{ currency: string | null }[]>`
        SELECT s.currency FROM barbershops s JOIN shop_memberships m ON m.barbershop_id = s.id
        WHERE s.id = ${barbershopId}::uuid AND m.user_id = ${principal!.userId}::uuid
          AND m.role = 'OWNER' AND s.deleted_at IS NULL
        FOR UPDATE OF s, m`;
      if (!shop) throw new Error("Forbidden");
      return operation(tx, shop.currency, principal!.userId);
    });
  }
  function audit(tx: Prisma.TransactionClient, barbershopId: string, actorUserId: string, event: string, details: Prisma.InputJsonObject) {
    return tx.auditEvent.create({ data: { barbershopId, actorUserId, event, details } });
  }
  async function activeService(tx: Prisma.TransactionClient, barbershopId: string, id: string) {
    const service = await tx.service.findFirst({ where: { barbershopId, id, archivedAt: null } });
    if (!service) throw new Error("Service not found");
    return service;
  }
  return {
    setCurrency(principal: StaffPrincipal | null, barbershopId: string, currency: string) {
      return withOwner(principal, barbershopId, async (tx, previous, actor) => {
        if (!Intl.supportedValuesOf("currency").includes(currency)) throw new Error("Unsupported currency");
        if (previous === currency) return;
        if (await tx.service.count({ where: { barbershopId } })) throw new Error("Currency cannot change while service prices exist");
        await tx.barbershop.update({ where: { id: barbershopId }, data: { currency } });
        await audit(tx, barbershopId, actor, "catalog.currency_set", { previous, currency });
      });
    },
    createService(principal: StaffPrincipal | null, barbershopId: string, input: ServiceInput) {
      return withOwner(principal, barbershopId, async (tx, currency, actor) => {
        if (!currency) throw new Error("Configure shop currency first");
        const data = serviceData(input);
        const service = await tx.service.create({ data: { ...data, barbershopId, currency } });
        await audit(tx, barbershopId, actor, "catalog.service_created", { serviceId: service.id, ...data, currency });
        return service;
      });
    },
    updateService(principal: StaffPrincipal | null, barbershopId: string, serviceId: string, input: ServiceInput) {
      return withOwner(principal, barbershopId, async (tx, _currency, actor) => {
        const previous = await activeService(tx, barbershopId, serviceId);
        const data = serviceData(input);
        const service = await tx.service.update({ where: { barbershopId_id: { barbershopId, id: serviceId } }, data });
        await audit(tx, barbershopId, actor, "catalog.service_updated", {
          serviceId, before: { name: previous.name, durationMinutes: previous.durationMinutes, priceMinor: previous.priceMinor }, after: { ...data },
        });
        return service;
      });
    },
    archiveService(principal: StaffPrincipal | null, barbershopId: string, serviceId: string) {
      return withOwner(principal, barbershopId, async (tx, _currency, actor) => {
        await activeService(tx, barbershopId, serviceId);
        await tx.service.update({ where: { barbershopId_id: { barbershopId, id: serviceId } }, data: { archivedAt: new Date() } });
        await audit(tx, barbershopId, actor, "catalog.service_archived", { serviceId });
      });
    },
    setBarberService(principal: StaffPrincipal | null, barbershopId: string, barberId: string, serviceId: string, input: BarberServiceInput) {
      return withOwner(principal, barbershopId, async (tx, _currency, actor) => {
        await activeService(tx, barbershopId, serviceId);
        if (!await tx.barber.findUnique({ where: { barbershopId_id: { barbershopId, id: barberId } } })) throw new Error("Barber not found");
        if (input.durationMinutes !== null) integer(input.durationMinutes, 1);
        if (input.priceMinor !== null) integer(input.priceMinor, 0);
        const data = { durationMinutes: input.durationMinutes, priceMinor: input.priceMinor };
        await tx.barberService.upsert({ where: { barbershopId_barberId_serviceId: { barbershopId, barberId, serviceId } },
          create: { barbershopId, barberId, serviceId, ...data }, update: data });
        await audit(tx, barbershopId, actor, "catalog.barber_service_set", { barberId, serviceId, ...data });
      });
    },
    removeBarberService(principal: StaffPrincipal | null, barbershopId: string, barberId: string, serviceId: string) {
      return withOwner(principal, barbershopId, async (tx, _currency, actor) => {
        const result = await tx.barberService.deleteMany({ where: { barbershopId, barberId, serviceId } });
        if (!result.count) throw new Error("Barber service not found");
        await audit(tx, barbershopId, actor, "catalog.barber_service_removed", { barberId, serviceId });
      });
    },
    list(principal: StaffPrincipal | null, barbershopId: string) {
      return withOwner(principal, barbershopId, async (tx, currency) => {
        const services = await tx.service.findMany({ where: { barbershopId, archivedAt: null }, orderBy: [{ name: "asc" }, { id: "asc" }] });
        const barbers = await tx.barber.findMany({ where: { barbershopId }, orderBy: { id: "asc" }, select: {
          id: true, barbershopId: true, displayName: true,
          services: { where: { service: { archivedAt: null } }, orderBy: { serviceId: "asc" }, select: { serviceId: true, durationMinutes: true, priceMinor: true } },
        } });
        return { currency, services, barbers: barbers.map(barber => ({ ...barber, services: barber.services.map((option): BarberServiceOption => ({
          serviceId: option.serviceId,
          ...(option.durationMinutes === null ? {} : { durationMinutes: option.durationMinutes }),
          ...(option.priceMinor === null ? {} : { priceMinor: option.priceMinor }),
        })) })) };
      });
    },
  };
}
