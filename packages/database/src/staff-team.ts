import { createHash, randomBytes } from "node:crypto";
import type { StaffPrincipal } from "@barber/auth";
import type { PrismaClient } from "./generated/prisma/client";
import { withShopOwner } from "./owner-transaction";

export function createStaffTeam(db: PrismaClient) {
  return {
    list(principal: StaffPrincipal | null, shopId: string) {
      return withShopOwner(db, principal, shopId, async tx => ({
        members: await tx.shopMembership.findMany({ where: { barbershopId: shopId }, orderBy: { id: "asc" }, select: { id: true, role: true, manageAppointments: true, manageSchedules: true, user: { select: { email: true } } } }),
        invites: await tx.staffInvite.findMany({ where: { barbershopId: shopId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" }, select: { id: true, email: true, role: true, expiresAt: true } }),
      }));
    },
    invite(principal: StaffPrincipal | null, shopId: string, input: { email: string; displayName: string; role: "BARBER" | "RECEPTIONIST"; manageAppointments: boolean; manageSchedules: boolean }) {
      return withShopOwner(db, principal, shopId, async (tx, _shop, actorUserId) => {
        const email = input.email.trim().toLowerCase(), displayName = input.displayName.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !displayName || displayName.length > 100 || !["BARBER", "RECEPTIONIST"].includes(input.role) || typeof input.manageAppointments !== "boolean" || typeof input.manageSchedules !== "boolean") throw new Error("Invalid invite");
        if (await tx.shopMembership.findFirst({ where: { barbershopId: shopId, user: { email: { equals: email, mode: "insensitive" } } } })) throw new Error("Already a member");
        await tx.staffInvite.updateMany({ where: { barbershopId: shopId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
        const code = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
        const invite = await tx.staffInvite.create({ data: { barbershopId: shopId, email, displayName, role: input.role, manageAppointments: input.manageAppointments, manageSchedules: input.manageSchedules, expiresAt, tokenHash: createHash("sha256").update(code).digest("hex") } });
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "team.invited", details: { inviteId: invite.id, role: input.role, manageAppointments: input.manageAppointments, manageSchedules: input.manageSchedules } } });
        return { code, expiresAt: expiresAt.toISOString() };
      });
    },
    revoke(principal: StaffPrincipal | null, shopId: string, inviteId: string) {
      return withShopOwner(db, principal, shopId, async (tx, _shop, actorUserId) => {
        const changed = await tx.staffInvite.updateMany({ where: { barbershopId: shopId, id: inviteId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
        if (changed.count !== 1) throw new Error("Invite changed");
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "team.invite_revoked", details: { inviteId } } });
      });
    },
    permissions(principal: StaffPrincipal | null, shopId: string, memberId: string, input: { manageAppointments: boolean; manageSchedules: boolean }) {
      return withShopOwner(db, principal, shopId, async (tx, _shop, actorUserId) => {
        if (typeof input.manageAppointments !== "boolean" || typeof input.manageSchedules !== "boolean") throw new Error("Invalid permissions");
        const changed = await tx.shopMembership.updateMany({ where: { id: memberId, barbershopId: shopId, role: { in: ["BARBER", "RECEPTIONIST"] } }, data: input });
        if (changed.count !== 1) throw new Error("Member unavailable");
        await tx.auditEvent.create({ data: { barbershopId: shopId, actorUserId, event: "team.permissions_updated", details: { memberId, ...input } } });
      });
    },
  };
}
