CREATE TABLE IF NOT EXISTS public.olt_region_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  olt varchar(120) NOT NULL UNIQUE,
  source varchar(80) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Adicionada', 'Ignorada')),
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  region varchar(160)
);

CREATE INDEX IF NOT EXISTS olt_region_requests_pending_idx
  ON public.olt_region_requests (last_seen_at DESC)
  WHERE status = 'Pendente';

ALTER TABLE public.olt_region_requests ENABLE ROW LEVEL SECURITY;