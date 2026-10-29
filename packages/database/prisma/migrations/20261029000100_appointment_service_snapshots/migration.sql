-- Additive: existing reservations have no invented/backfilled service history.
CREATE TABLE "appointment_services" (
  "id" UUID NOT NULL PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "price_minor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  CONSTRAINT "appointment_services_position_nonnegative" CHECK ("position" >= 0),
  CONSTRAINT "appointment_services_name_not_empty" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "appointment_services_duration_positive" CHECK ("duration_minutes" > 0),
  CONSTRAINT "appointment_services_price_nonnegative" CHECK ("price_minor" >= 0),
  CONSTRAINT "appointment_services_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "appointment_services_barbershop_id_appointment_id_fkey"
    FOREIGN KEY ("barbershop_id", "appointment_id") REFERENCES "appointments"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "appointment_services_barbershop_id_service_id_fkey"
    FOREIGN KEY ("barbershop_id", "service_id") REFERENCES "services"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "appointment_services_barbershop_id_appointment_id_position_key"
  ON "appointment_services"("barbershop_id", "appointment_id", "position");
CREATE UNIQUE INDEX "appointment_services_barbershop_id_appointment_id_service_id_key"
  ON "appointment_services"("barbershop_id", "appointment_id", "service_id");
CREATE INDEX "appointment_services_barbershop_id_service_id_idx"
  ON "appointment_services"("barbershop_id", "service_id");
