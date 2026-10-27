ALTER TABLE "barbershops" ADD COLUMN "currency" VARCHAR(3);
ALTER TABLE "barbershops" ADD CONSTRAINT "barbershops_currency_format" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$');
CREATE UNIQUE INDEX "barbershops_id_currency_key" ON "barbershops"("id", "currency");

CREATE TABLE "services" (
  "id" UUID NOT NULL PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "price_minor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "services_name_not_empty" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "services_duration_positive" CHECK ("duration_minutes" > 0),
  CONSTRAINT "services_price_nonnegative" CHECK ("price_minor" >= 0),
  CONSTRAINT "services_barbershop_id_currency_fkey" FOREIGN KEY ("barbershop_id", "currency") REFERENCES "barbershops"("id", "currency") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "services_barbershop_id_id_key" ON "services"("barbershop_id", "id");

CREATE TABLE "barber_services" (
  "barbershop_id" UUID NOT NULL,
  "barber_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "duration_minutes" INTEGER,
  "price_minor" INTEGER,
  CONSTRAINT "barber_services_pkey" PRIMARY KEY ("barbershop_id", "barber_id", "service_id"),
  CONSTRAINT "barber_services_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
  CONSTRAINT "barber_services_price_nonnegative" CHECK ("price_minor" IS NULL OR "price_minor" >= 0),
  CONSTRAINT "barber_services_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "barber_services_barbershop_id_barber_id_fkey" FOREIGN KEY ("barbershop_id", "barber_id") REFERENCES "barbers"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "barber_services_barbershop_id_service_id_fkey" FOREIGN KEY ("barbershop_id", "service_id") REFERENCES "services"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "barber_services_barbershop_id_service_id_idx" ON "barber_services"("barbershop_id", "service_id");

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "event" VARCHAR(64) NOT NULL,
  "details" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "audit_events_barbershop_id_created_at_idx" ON "audit_events"("barbershop_id", "created_at");
