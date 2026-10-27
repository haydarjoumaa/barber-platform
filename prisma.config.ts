import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "packages/database/prisma/schema.prisma",
  migrations: { path: "packages/database/prisma/migrations" },
  // Generation and validation work before local database setup; queries still require .env.
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/barber" },
});
