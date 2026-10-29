CREATE TABLE "barber_schedule_overrides" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "barber_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "periods" JSONB NOT NULL CHECK (jsonb_typeof("periods") = 'array'),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "override_barber_tenant_fk" FOREIGN KEY ("barbershop_id", "barber_id") REFERENCES "barbers"("barbershop_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "barber_schedule_overrides_barbershop_id_barber_id_date_key" ON "barber_schedule_overrides"("barbershop_id", "barber_id", "date");
CREATE UNIQUE INDEX "barber_schedule_overrides_barbershop_id_id_key" ON "barber_schedule_overrides"("barbershop_id", "id");
CREATE TABLE "shop_closures" (
  "id" UUID PRIMARY KEY,
  "barbershop_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  CONSTRAINT "closure_shop_fk" FOREIGN KEY ("barbershop_id") REFERENCES "barbershops"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "shop_closures_barbershop_id_date_key" ON "shop_closures"("barbershop_id", "date");
CREATE UNIQUE INDEX "shop_closures_barbershop_id_id_key" ON "shop_closures"("barbershop_id", "id");
