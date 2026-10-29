ALTER TABLE "appointments"
  ADD COLUMN "guest_name" VARCHAR(100),
  ADD COLUMN "guest_phone" VARCHAR(16),
  ADD CONSTRAINT "appointments_guest_contact_valid" CHECK (
    ("guest_name" IS NULL AND "guest_phone" IS NULL)
    OR ("client_id" IS NULL AND "guest_name" IS NOT NULL AND length(btrim("guest_name")) > 0
      AND ("guest_phone" IS NULL OR "guest_phone" ~ '^\+[1-9][0-9]{7,14}$'))
  );
