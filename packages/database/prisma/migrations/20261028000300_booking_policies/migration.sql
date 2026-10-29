CREATE TABLE "shop_booking_policies" (
  "barbershop_id" UUID PRIMARY KEY REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "slot_interval_minutes" INTEGER NOT NULL CHECK ("slot_interval_minutes" BETWEEN 1 AND 1440),
  "minimum_notice_minutes" INTEGER NOT NULL CHECK ("minimum_notice_minutes" >= 0),
  "buffer_after_minutes" INTEGER NOT NULL CHECK ("buffer_after_minutes" >= 0),
  "cancellation_notice_minutes" INTEGER NOT NULL CHECK ("cancellation_notice_minutes" >= 0),
  "rescheduling_notice_minutes" INTEGER NOT NULL CHECK ("rescheduling_notice_minutes" >= 0),
  "approval_mode" VARCHAR(9) NOT NULL CHECK ("approval_mode" IN ('AUTOMATIC', 'MANUAL')),
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
