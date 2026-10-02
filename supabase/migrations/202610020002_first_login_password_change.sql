ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ALTER COLUMN password_change_required SET DEFAULT false;