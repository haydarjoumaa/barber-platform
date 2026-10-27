import type { StaffRole } from "@barber/shared";

/** Must originate from a verified server session, never from a request payload. */
export interface StaffPrincipal { userId: string; memberships: ReadonlyArray<{ barbershopId: string; role: StaffRole }>; }

/** Minimal deny-by-default boundary. Granular barber/receptionist permissions come with their workflows. */
export function requireShopOwner(principal: StaffPrincipal | null, barbershopId: string): void {
  if (!principal || !principal.memberships.some(membership => membership.barbershopId === barbershopId && membership.role === "OWNER")) {
    throw new Error("Forbidden");
  }
}
