ALTER TABLE "shop_memberships" ADD COLUMN "manage_appointments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manage_schedules" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "staff_invites" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL REFERENCES "barbershops"("id") ON DELETE RESTRICT,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "email" VARCHAR(254) NOT NULL,
  "display_name" VARCHAR(100) NOT NULL CHECK (length(btrim("display_name")) > 0),
  "role" "StaffRole" NOT NULL CHECK ("role" IN ('BARBER', 'RECEPTIONIST')),
  "manage_appointments" BOOLEAN NOT NULL DEFAULT false,
  "manage_schedules" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "accepted_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX "staff_invites_barbershop_id_id_key" ON "staff_invites"("barbershop_id", "id");
CREATE INDEX "staff_invites_barbershop_id_email_idx" ON "staff_invites"("barbershop_id", "email");
