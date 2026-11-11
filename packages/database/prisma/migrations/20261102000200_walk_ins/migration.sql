ALTER TABLE "appointments" ADD COLUMN "walk_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "barbershops" ADD COLUMN "walk_in_queue_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "WalkInQueueStatus" AS ENUM ('WAITING', 'SERVED', 'REMOVED');
CREATE TABLE "walkin_queue" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL REFERENCES "barbershops"("id") ON DELETE RESTRICT,
  "client_id" UUID,
  "guest_name" VARCHAR(100),
  "guest_phone" VARCHAR(16),
  "preferred_barber_id" UUID,
  "service_ids" UUID[] NOT NULL CHECK (cardinality("service_ids") BETWEEN 1 AND 20),
  "status" "WalkInQueueStatus" NOT NULL DEFAULT 'WAITING',
  "appointment_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  -- Exactly one identity: a shop client profile or a named guest.
  CHECK (("client_id" IS NOT NULL AND "guest_name" IS NULL AND "guest_phone" IS NULL) OR ("client_id" IS NULL AND length(btrim("guest_name")) > 0)),
  CHECK (("status" = 'WAITING') = ("resolved_at" IS NULL)),
  CHECK (("status" = 'SERVED') = ("appointment_id" IS NOT NULL)),
  FOREIGN KEY ("barbershop_id", "client_id") REFERENCES "clients"("barbershop_id", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("barbershop_id", "preferred_barber_id") REFERENCES "barbers"("barbershop_id", "id") ON DELETE RESTRICT,
  FOREIGN KEY ("barbershop_id", "appointment_id") REFERENCES "appointments"("barbershop_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "walkin_queue_barbershop_id_id_key" ON "walkin_queue"("barbershop_id", "id");
CREATE UNIQUE INDEX "walkin_queue_barbershop_id_appointment_id_key" ON "walkin_queue"("barbershop_id", "appointment_id");
CREATE INDEX "walkin_queue_barbershop_id_status_created_at_idx" ON "walkin_queue"("barbershop_id", "status", "created_at");
