import "server-only";
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
