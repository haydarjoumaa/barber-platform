ALTER TABLE "clients" ADD COLUMN "birthday" DATE;
CREATE TABLE "client_sessions" (
  "token_hash" VARCHAR(64) PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("barbershop_id", "client_id") REFERENCES "clients"("barbershop_id", "id") ON DELETE CASCADE
);
CREATE INDEX "client_sessions_barbershop_id_client_id_idx" ON "client_sessions"("barbershop_id", "client_id");
CREATE INDEX "client_sessions_expires_at_idx" ON "client_sessions"("expires_at");
CREATE TABLE "client_reset_tokens" (
  "token_hash" VARCHAR(64) PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  FOREIGN KEY ("barbershop_id", "client_id") REFERENCES "clients"("barbershop_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "client_reset_tokens_barbershop_id_client_id_key" ON "client_reset_tokens"("barbershop_id", "client_id");
CREATE TABLE "client_events" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL REFERENCES "barbershops"("id") ON DELETE RESTRICT,
  "client_id" UUID,
  "event" VARCHAR(64) NOT NULL,
  "details" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("barbershop_id", "client_id") REFERENCES "clients"("barbershop_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "client_events_barbershop_id_created_at_idx" ON "client_events"("barbershop_id", "created_at");
