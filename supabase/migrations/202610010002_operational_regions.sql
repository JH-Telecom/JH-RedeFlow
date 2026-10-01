CREATE TABLE IF NOT EXISTS public.operational_regions (
  region varchar(160) PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_regions ENABLE ROW LEVEL SECURITY;