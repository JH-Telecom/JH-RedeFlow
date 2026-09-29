CREATE TABLE IF NOT EXISTS public.olt_region_overrides (
  olt varchar(120) PRIMARY KEY,
  region varchar(160) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.olt_region_overrides ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.olt_region_overrides TO service_role;