-- Fail explicitly on pre-existing case collisions rather than merging identities.
CREATE UNIQUE INDEX "users_email_case_insensitive_key" ON "users"(lower("email"));
CREATE TABLE "staff_sessions" (
  "token_hash" VARCHAR(64) PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "staff_sessions_user_id_idx" ON "staff_sessions"("user_id");
CREATE INDEX "staff_sessions_expires_at_idx" ON "staff_sessions"("expires_at");
CREATE TABLE "auth_rate_limits" (
  "key" VARCHAR(100) PRIMARY KEY,
  "attempts" INTEGER NOT NULL CHECK ("attempts" > 0),
  "expires_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "auth_rate_limits_expires_at_idx" ON "auth_rate_limits"("expires_at");
CREATE TABLE "staff_auth_events" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "event" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "staff_auth_events_user_id_created_at_idx" ON "staff_auth_events"("user_id", "created_at");
