CREATE TABLE IF NOT EXISTS public.manual_daily_bases (
  business_date date PRIMARY KEY,
  file_name varchar(255) NOT NULL,
  payload jsonb NOT NULL,
  uploaded_by varchar(255) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS team_role varchar(20) NOT NULL DEFAULT 'Tecnico';
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS lead_technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL;

ALTER TABLE public.manual_daily_bases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_daily_bases_authenticated_select ON public.manual_daily_bases;
CREATE POLICY manual_daily_bases_authenticated_select ON public.manual_daily_bases FOR SELECT TO authenticated USING (true);