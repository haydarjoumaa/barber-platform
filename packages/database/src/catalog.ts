import { withShopOwner } from "./owner-transaction";
import { type StaffPrincipal } from "@barber/auth";
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
    return withShopOwner(database, principal, barbershopId, (tx, shop, actor) => operation(tx, shop.currency, actor));
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
    createBarber(principal: StaffPrincipal | null, barbershopId: string, membershipId: string, displayName: string) {
      return withOwner(principal, barbershopId, async (tx, _currency, actor) => {
        if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 100) throw new Error("Invalid barber name");
        if (!await tx.shopMembership.findUnique({ where: { barbershopId_id: { barbershopId, id: membershipId } } })) throw new Error("Member not found");
        const barber = await tx.barber.create({ data: { barbershopId, membershipId, displayName: displayName.trim() } });
        await audit(tx, barbershopId, actor, "team.barber_created", { barberId: barber.id, membershipId, displayName: barber.displayName });
        return barber;
      });
    },
    renameBarber(principal: StaffPrincipal | null, barbershopId: string, barberId: string, displayName: string) {
      return withOwner(principal, barbershopId, async (tx, _currency, actor) => {
        if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 100) throw new Error("Invalid barber name");
        const previous = await tx.barber.findUnique({ where: { barbershopId_id: { barbershopId, id: barberId } } });
        if (!previous) throw new Error("Barber not found");
        const barber = await tx.barber.update({ where: { barbershopId_id: { barbershopId, id: barberId } }, data: { displayName: displayName.trim() } });
        await audit(tx, barbershopId, actor, "team.barber_renamed", { barberId, before: previous.displayName, after: barber.displayName });
        return barber;
      });
    },
    setCurrency(principal: StaffPrincipal | null, barbershopId: string, currency: string) {
      return withOwner(principal, barbershopId, async (tx, previous, actor) => {
        if (!Intl.supportedValuesOf("currency").includes(currency)) throw new Error("Unsupported currency");
        if (previous === currency) return;
        if (await tx.service.count({ where: { barbershopId } })) throw new Error("Currency cannot change while service prices exist");
        await tx.barbershop.update({ where: { id: barbershopId }, data: { currency } });
        await audit(tx, barbershopId, actor, "catalog.currency_set", { previous, currency });
      });
    },
    createService(principal: StaffPrincipal | null, barbershopId: string, input: ServiceInput, expectedCurrency?: string) {
      return withOwner(principal, barbershopId, async (tx, currency, actor) => {
        if (!currency) throw new Error("Configure shop currency first");
        if (expectedCurrency !== undefined && currency !== expectedCurrency) throw new Error("Shop currency changed; reload before saving");
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
        const availableMembers = await tx.shopMembership.findMany({ where: { barbershopId, barber: null }, orderBy: { id: "asc" }, select: { id: true, user: { select: { email: true } } } });
        return { currency, services, availableMembers: availableMembers.map(member => ({ id: member.id, email: member.user.email })), barbers: barbers.map(barber => ({ ...barber, services: barber.services.map((option): BarberServiceOption => ({
          serviceId: option.serviceId,
          ...(option.durationMinutes === null ? {} : { durationMinutes: option.durationMinutes }),
          ...(option.priceMinor === null ? {} : { priceMinor: option.priceMinor }),
        })) })) };
      });
    },
  };
}
