-- Planilha da Giga no sistema (12/11/2026). A planilha "JH (NN).xlsx" que a Giga manda (acumulada no mes) e importada em
-- Indicadores > IGP:
-- - giga_orders: cada ordem da aba "Analitico de Redes" (cluster, abertura e fechamento oficiais, prazo, outlier);
-- - calls.giga_*: o cluster e os horarios da Giga no chamado correspondente (o IGP usa esses quando houver);
-- - giga_imports: cada importacao, com os numeros dos indicadores do IGP ACESSO por cluster (abas Altas, Reparos,
--   IRR, IFI, Visita na agenda, IRT, Cancelamentos, Base de clientes, Eficiencias);
-- - igp_rules: pesos, metas, minimos e faixas do IGP ACESSO (editaveis; a Giga muda as regras).
-- So o backend (service_role) le e grava; RLS ligado e sem politicas. Nenhum dado existente e alterado aqui.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS giga_cluster text;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS giga_opened_at timestamptz;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS giga_closed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.giga_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  month text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  main_cluster text,
  closed_until timestamptz,
  orders_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  indicators jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_by text,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS giga_imports_month_idx ON public.giga_imports(month, imported_at DESC);
ALTER TABLE public.giga_imports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.giga_orders (
  os text PRIMARY KEY,
  os_ofs text,
  origin text,
  cluster text,
  regional text,
  city text,
  element text,
  resource text,
  opened_at timestamptz,
  closed_at timestamptz,
  tme_hours numeric,
  on_time boolean,
  outlier boolean,
  month text,
  call_id uuid,
  import_id uuid REFERENCES public.giga_imports(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS giga_orders_month_idx ON public.giga_orders(month, cluster);
CREATE INDEX IF NOT EXISTS giga_orders_call_idx ON public.giga_orders(call_id);
ALTER TABLE public.giga_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.igp_rules (
  id smallint PRIMARY KEY CHECK (id = 1),
  rules jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
ALTER TABLE public.igp_rules ENABLE ROW LEVEL SECURITY;
