ALTER TABLE "shop_memberships"
  ADD COLUMN "access_disabled_at" TIMESTAMPTZ(3);

ALTER TABLE "shop_memberships"
  ADD CONSTRAINT "shop_memberships_disabled_access_check"
  CHECK ("access_disabled_at" IS NULL OR
    ("role" <> 'OWNER' AND NOT "manage_appointments" AND NOT "manage_schedules"));
