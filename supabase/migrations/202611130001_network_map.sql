-- Mapa da rede (13/11/2026): elementos da rede (POP, CTO, CEO), cabos, arquivos importados, POP -> OLT,
-- clientes lidos nas OLTs e pedidos de leitura de PON. So o backend (service_role) le e grava; RLS ligado e sem politicas.
CREATE TABLE IF NOT EXISTS public.network_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('pop', 'cto', 'ceo', 'outro')),
  code text,
  name text,
  project_code text,
  pop text,
  fh text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  source_file text NOT NULL,
  imported_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS network_elements_code_uidx ON public.network_elements(code);
CREATE INDEX IF NOT EXISTS network_elements_lat_lng_idx ON public.network_elements(lat, lng);
CREATE INDEX IF NOT EXISTS network_elements_source_file_idx ON public.network_elements(source_file);
ALTER TABLE public.network_elements ENABLE ROW LEVEL SECURITY;

-- Clusters de CTO/CEO calculados no banco (zoom baixo do mapa): uma celula por grade de `grid` graus.
CREATE OR REPLACE FUNCTION public.network_clusters(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision, grid double precision)
RETURNS TABLE(lat double precision, lng double precision, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT avg(e.lat), avg(e.lng), count(*)
  FROM public.network_elements e
  WHERE e.kind IN ('cto', 'ceo') AND e.lat BETWEEN min_lat AND max_lat AND e.lng BETWEEN min_lng AND max_lng
  GROUP BY floor(e.lat / grid), floor(e.lng / grid)
$$;
REVOKE ALL ON FUNCTION public.network_clusters(double precision, double precision, double precision, double precision, double precision) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.network_clusters(double precision, double precision, double precision, double precision, double precision) TO service_role;

CREATE TABLE IF NOT EXISTS public.network_cables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  color text,
  points jsonb NOT NULL,
  min_lat double precision NOT NULL,
  min_lng double precision NOT NULL,
  max_lat double precision NOT NULL,
  max_lng double precision NOT NULL,
  source_file text NOT NULL
);
CREATE INDEX IF NOT EXISTS network_cables_lat_idx ON public.network_cables(min_lat, max_lat);
CREATE INDEX IF NOT EXISTS network_cables_lng_idx ON public.network_cables(min_lng, max_lng);
CREATE INDEX IF NOT EXISTS network_cables_source_file_idx ON public.network_cables(source_file);
ALTER TABLE public.network_cables ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.network_sources (
  file_name text PRIMARY KEY,
  sha256 text,
  elements int,
  cables int,
  imported_by text,
  imported_at timestamptz DEFAULT now()
);
ALTER TABLE public.network_sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.network_pop_olts (
  pop text NOT NULL,
  olt text NOT NULL,
  active boolean DEFAULT true,
  note text,
  confirmed_by text,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (pop, olt)
);
ALTER TABLE public.network_pop_olts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.network_clients (
  contract text PRIMARY KEY,
  serial text,
  int6 text,
  olt text NOT NULL,
  ponlink text NOT NULL,
  signal_rx double precision,
  onu_status text,
  last_inform text,
  lat double precision,
  lng double precision,
  read_at timestamptz NOT NULL,
  read_by text
);
CREATE INDEX IF NOT EXISTS network_clients_olt_ponlink_idx ON public.network_clients(olt, ponlink);
ALTER TABLE public.network_clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.network_pon_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  olt text NOT NULL,
  ponlink text NOT NULL,
  call_id text,
  requested_by text,
  requested_at timestamptz DEFAULT now(),
  done_at timestamptz,
  found int,
  read int,
  error text
);
CREATE UNIQUE INDEX IF NOT EXISTS network_pon_requests_open_uidx ON public.network_pon_requests(olt, ponlink) WHERE done_at IS NULL;
ALTER TABLE public.network_pon_requests ENABLE ROW LEVEL SECURITY;

-- Permissoes do mapa da rede: ver o mapa e importar a rede / editar POP -> OLT. Concedidas a Administrador e Operador.
insert into public.permissions (code, description)
values
  ('network.view', 'Ver o mapa da rede'),
  ('network.manage', 'Importar a rede e editar POP → OLT')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name in ('Administrador', 'Operador')
  and p.code in ('network.view', 'network.manage')
on conflict do nothing;
