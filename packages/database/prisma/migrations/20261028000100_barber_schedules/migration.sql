CREATE TABLE "barber_schedule_periods" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "barber_id" UUID NOT NULL,
  "day_of_week" INTEGER NOT NULL CHECK ("day_of_week" BETWEEN 1 AND 7),
  "kind" VARCHAR(5) NOT NULL CHECK ("kind" IN ('WORK', 'BREAK')),
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "start_occurrence" VARCHAR(7) CHECK ("start_occurrence" IN ('earlier', 'later')),
  "end_occurrence" VARCHAR(7) CHECK ("end_occurrence" IN ('earlier', 'later')),
  CONSTRAINT "schedule_interval_valid" CHECK ("start_minute" >= 0 AND "end_minute" > "start_minute" AND "end_minute" < 2880 AND ("kind" = 'BREAK' OR "start_minute" < 1440)),
  CONSTRAINT "schedule_barber_tenant_fk" FOREIGN KEY ("barbershop_id", "barber_id") REFERENCES "barbers"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "barber_schedule_periods_barbershop_id_id_key" ON "barber_schedule_periods"("barbershop_id", "id");
CREATE INDEX "barber_schedule_periods_barbershop_id_barber_id_day_of_week_idx" ON "barber_schedule_periods"("barbershop_id", "barber_id", "day_of_week");
CREATE TABLE "barber_time_off" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "barber_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "time_off_interval_valid" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "time_off_barber_tenant_fk" FOREIGN KEY ("barbershop_id", "barber_id") REFERENCES "barbers"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "barber_time_off_barbershop_id_id_key" ON "barber_time_off"("barbershop_id", "id");
CREATE INDEX "barber_time_off_barbershop_id_barber_id_starts_at_idx" ON "barber_time_off"("barbershop_id", "barber_id", "starts_at");
