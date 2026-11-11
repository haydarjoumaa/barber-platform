ALTER TABLE staff_sessions ADD COLUMN barbershop_id UUID REFERENCES barbershops(id) ON DELETE RESTRICT;
CREATE INDEX staff_sessions_barbershop_id_idx ON staff_sessions(barbershop_id);
