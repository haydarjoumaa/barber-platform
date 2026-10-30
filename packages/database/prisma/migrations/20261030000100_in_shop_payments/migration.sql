CREATE TABLE "payments" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "recorded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "amount_minor" BIGINT NOT NULL CHECK ("amount_minor" >= 0),
  "currency" VARCHAR(3) NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voided_at" TIMESTAMPTZ(3),
  "void_reason" VARCHAR(500),
  CONSTRAINT "payments_void_fields" CHECK (
    ("voided_at" IS NULL AND "void_reason" IS NULL) OR
    ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL AND length(btrim("void_reason")) > 0)
  ),
  CONSTRAINT "payments_appointment_tenant_fk" FOREIGN KEY ("barbershop_id", "appointment_id")
    REFERENCES "appointments"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "payments_barbershop_id_id_key" ON "payments"("barbershop_id", "id");
CREATE UNIQUE INDEX "payments_one_active_receipt" ON "payments"("barbershop_id", "appointment_id") WHERE "voided_at" IS NULL;
CREATE INDEX "payments_barbershop_id_created_at_idx" ON "payments"("barbershop_id", "created_at");
