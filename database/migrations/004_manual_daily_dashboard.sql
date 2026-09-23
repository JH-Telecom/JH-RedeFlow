CREATE TABLE IF NOT EXISTS manual_daily_bases (
  business_date date PRIMARY KEY,
  file_name varchar(255) NOT NULL,
  payload jsonb NOT NULL,
  uploaded_by varchar(255) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS team_role varchar(20) NOT NULL DEFAULT 'Tecnico';
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS lead_technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL;