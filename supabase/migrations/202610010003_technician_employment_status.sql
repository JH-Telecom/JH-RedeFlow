ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS employment_status varchar(20) NOT NULL DEFAULT 'Trabalhando';

ALTER TABLE public.technicians
  DROP CONSTRAINT IF EXISTS technicians_employment_status_check;

ALTER TABLE public.technicians
  ADD CONSTRAINT technicians_employment_status_check
  CHECK (employment_status IN ('Trabalhando', 'Demitido'));