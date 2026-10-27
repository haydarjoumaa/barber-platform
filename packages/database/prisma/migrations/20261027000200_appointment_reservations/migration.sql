-- Required for UUID equality alongside timestamp range overlap in GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "barbershop_id" UUID NOT NULL,
    "barber_id" UUID NOT NULL,
    "client_id" UUID,
    "status" "AppointmentStatus" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "service_ends_at" TIMESTAMPTZ(3) NOT NULL,
    "occupied_until" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_valid_interval" CHECK (
      isfinite("starts_at") AND isfinite("service_ends_at") AND isfinite("occupied_until")
      AND "starts_at" < "service_ends_at" AND "service_ends_at" <= "occupied_until"
    ),
    -- Half-open intervals permit the next appointment to start at occupied_until.
    -- Completed/no-show records preserve historical occupancy. Only cancellation releases it.
    CONSTRAINT "appointments_no_barber_overlap" EXCLUDE USING gist (
      "barbershop_id" WITH =,
      "barber_id" WITH =,
      tstzrange("starts_at", "occupied_until", '[)') WITH &&
    ) WHERE ("status" <> 'CANCELLED')
);

CREATE UNIQUE INDEX "appointments_barbershop_id_id_key" ON "appointments"("barbershop_id", "id");
CREATE INDEX "appointments_barbershop_id_starts_at_idx" ON "appointments"("barbershop_id", "starts_at");
CREATE INDEX "appointments_barbershop_id_client_id_starts_at_idx" ON "appointments"("barbershop_id", "client_id", "starts_at");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barbershop_id_fkey" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barbershop_id_barber_id_fkey" FOREIGN KEY ("barbershop_id", "barber_id") REFERENCES "barbers"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barbershop_id_client_id_fkey" FOREIGN KEY ("barbershop_id", "client_id") REFERENCES "clients"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
