CREATE TYPE "MediaKind" AS ENUM ('SHOP_LOGO', 'PROFILE', 'HAIRCUT');
CREATE TABLE "media_assets" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL REFERENCES "barbershops"("id") ON DELETE RESTRICT,
  "client_id" UUID,
  "uploaded_by_user_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "kind" "MediaKind" NOT NULL,
  "storage_key" VARCHAR(40) NOT NULL UNIQUE CHECK ("storage_key" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'),
  "mime_type" VARCHAR(32) NOT NULL CHECK ("mime_type" = 'image/jpeg'),
  "byte_size" INTEGER NOT NULL CHECK ("byte_size" > 0),
  "width" INTEGER NOT NULL CHECK ("width" > 0 AND "width" <= 1600),
  "height" INTEGER NOT NULL CHECK ("height" > 0 AND "height" <= 1600),
  "consent_at" TIMESTAMPTZ(3) NOT NULL,
  "consent_source" VARCHAR(6) NOT NULL CHECK ("consent_source" IN ('OWNER', 'CLIENT')),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_at" TIMESTAMPTZ(3),
  "purged_at" TIMESTAMPTZ(3),
  CONSTRAINT "media_assets_client_tenant_fk" FOREIGN KEY ("barbershop_id", "client_id") REFERENCES "clients"("barbershop_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "media_assets_subject" CHECK (("kind" = 'SHOP_LOGO' AND "client_id" IS NULL) OR ("kind" IN ('PROFILE', 'HAIRCUT') AND "client_id" IS NOT NULL)),
  CONSTRAINT "media_assets_consent_actor" CHECK (("consent_source" = 'OWNER' AND "uploaded_by_user_id" IS NOT NULL) OR ("consent_source" = 'CLIENT' AND "client_id" IS NOT NULL AND "uploaded_by_user_id" IS NULL)),
  CONSTRAINT "media_assets_purge_after_removal" CHECK ("purged_at" IS NULL OR "removed_at" IS NOT NULL)
);
CREATE UNIQUE INDEX "media_assets_barbershop_id_id_key" ON "media_assets"("barbershop_id", "id");
CREATE INDEX "media_assets_barbershop_id_client_id_created_at_idx" ON "media_assets"("barbershop_id", "client_id", "created_at");
CREATE UNIQUE INDEX "media_assets_active_logo" ON "media_assets"("barbershop_id") WHERE "kind" = 'SHOP_LOGO' AND "removed_at" IS NULL;
CREATE UNIQUE INDEX "media_assets_active_profile" ON "media_assets"("barbershop_id", "client_id") WHERE "kind" = 'PROFILE' AND "removed_at" IS NULL;
