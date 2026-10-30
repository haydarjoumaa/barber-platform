ALTER TABLE "barbershops" ADD COLUMN "suspended_at" TIMESTAMPTZ(3);
CREATE TABLE "platform_admins" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "platform_audit_events" (
  "id" UUID PRIMARY KEY,
  "actor_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "event" VARCHAR(64) NOT NULL,
  "details" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "platform_audit_events_created_at_idx" ON "platform_audit_events"("created_at");
