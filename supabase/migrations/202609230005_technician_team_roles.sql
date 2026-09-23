ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS team_role varchar(20) NOT NULL DEFAULT 'Tecnico';
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS lead_technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL;
