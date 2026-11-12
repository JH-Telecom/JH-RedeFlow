-- Roteirizador da madrugada (12/11/2026): das 00h as 06h a extensao do PC da coleta move no OFS os chamados sem
-- tecnico para o tecnico de plantao da regiao. Configuracao (liga/desliga, modo teste), escala de plantao e historico.
-- So o backend (service_role) le e grava; RLS ligado e sem politicas.
CREATE TABLE IF NOT EXISTS public.night_router_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
ALTER TABLE public.night_router_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.night_router_settings (id, enabled, test_mode) VALUES (1, false, true) ON CONFLICT (id) DO NOTHING;

-- weekday: 0 = domingo ... 6 = sabado (o dia da madrugada: 00h-06h de segunda = 1).
CREATE TABLE IF NOT EXISTS public.night_router_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL CHECK (char_length(region) BETWEEN 1 AND 160),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  technician_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region, weekday)
);
ALTER TABLE public.night_router_shifts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.night_router_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid,
  order_number text NOT NULL,
  region text,
  technician_id uuid,
  technician_name text,
  result text NOT NULL CHECK (result IN ('Movida', 'Teste', 'Erro', 'Pulada')),
  message text,
  test_mode boolean NOT NULL DEFAULT false,
  machine text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS night_router_runs_created_idx ON public.night_router_runs(created_at DESC);
ALTER TABLE public.night_router_runs ENABLE ROW LEVEL SECURITY;
