ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS active_override boolean NOT NULL DEFAULT false;
