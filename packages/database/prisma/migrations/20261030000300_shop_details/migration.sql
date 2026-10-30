ALTER TABLE "barbershops"
  ADD COLUMN "phone" VARCHAR(16),
  ADD COLUMN "address" VARCHAR(500),
  ADD COLUMN "description" VARCHAR(2000),
  ADD COLUMN "brand_color" VARCHAR(7) NOT NULL DEFAULT '#2563eb',
  ADD CONSTRAINT "barbershops_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "barbershops_brand_color_format" CHECK ("brand_color" ~ '^#[0-9a-fA-F]{6}$');
