ALTER TABLE "media_assets" ADD COLUMN "caption" VARCHAR(200);
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_subject";
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_subject" CHECK (
  ("kind" IN ('SHOP_LOGO', 'SHOP_GALLERY') AND "client_id" IS NULL) OR
  ("kind" IN ('PROFILE', 'HAIRCUT') AND "client_id" IS NOT NULL)
);
ALTER TABLE "barbershops" ADD COLUMN "website_url" VARCHAR(500), ADD COLUMN "instagram_url" VARCHAR(500), ADD COLUMN "facebook_url" VARCHAR(500);
