import "server-only";
export { createMediaRepository } from "./media";
export { createPlatformAdministration } from "./platform-admin";
export { createStaffTeam } from "./staff-team";
export { createShopDetails, type ShopDetailsInput } from "./shop-details";
export { createClientBookings, type ClientSlotInput } from "./client-bookings";
export { createClientAccounts } from "./client-accounts";
export { createShopPayments } from "./payments";
export { createShopProfiles, ShopProfileError, type ShopProfileInput } from "./shop-profile";
export { createClientProfiles, CLIENT_HISTORY_PAGE_SIZE } from "./client-profiles";
export { createOwnerBookings, SlotUnavailableError, CancellationDeadlineError, ClientPhoneExistsError, type OwnerBookingInput } from "./bookings";
export { createBookingAvailability, BookingPolicyMissingError } from "./booking-availability";
export { createBarberSchedules } from "./schedules";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
export { createServiceCatalog, type ServiceInput, type BarberServiceInput } from "./catalog";
export { createStaffAccounts, AccountError, STAFF_SESSION_SECONDS, type OwnerRegistration } from "./staff-accounts";

const globalDatabase = globalThis as unknown as { barberDatabase?: PrismaClient };

/** Server-only connection. Callers must scope every tenant query to an authorized shop. */
export function getDatabase(): PrismaClient {
  if (globalDatabase.barberDatabase) return globalDatabase.barberDatabase;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for database access");
  const adapter = new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
  const database = new PrismaClient({ adapter });
  globalDatabase.barberDatabase = database;
  return database;
}
