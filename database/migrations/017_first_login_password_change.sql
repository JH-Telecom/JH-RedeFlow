ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT true;

ALTER TABLE users
  ALTER COLUMN password_change_required SET DEFAULT false;