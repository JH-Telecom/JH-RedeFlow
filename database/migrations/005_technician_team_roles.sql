ALTER TABLE technicians ADD COLUMN IF NOT EXISTS team_role varchar(20) NOT NULL DEFAULT 'Tecnico';
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS lead_technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL;
