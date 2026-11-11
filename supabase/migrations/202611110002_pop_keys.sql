-- Controle das chaves dos POPs (11/11/2026): quem esta com cada chave, desde quando, e o historico de retiradas e
-- devolucoes com a foto tirada na retirada. So o backend (service_role) le e grava; RLS ligado e sem politicas.
CREATE TABLE IF NOT EXISTS public.pop_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pop text NOT NULL UNIQUE CHECK (char_length(pop) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'Base' CHECK (status IN ('Base', 'Retirada', 'A conferir')),
  holder_name text,
  holder_kind text CHECK (holder_kind IN ('Tecnico', 'Supervisor', 'Outro')),
  holder_id uuid,
  taken_at timestamptz,
  notes text,
  current_movement_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pop_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pop_key_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pop_key_id uuid NOT NULL REFERENCES public.pop_keys(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('Retirada', 'Devolucao', 'Ajuste')),
  holder_name text,
  holder_kind text,
  holder_id uuid,
  photo text,
  has_photo boolean GENERATED ALWAYS AS (photo IS NOT NULL) STORED,
  notes text,
  happened_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pop_key_movements_key_idx ON public.pop_key_movements(pop_key_id, happened_at DESC);
ALTER TABLE public.pop_key_movements ENABLE ROW LEVEL SECURITY;

-- Situacao inicial copiada da planilha de chaves (imagem enviada em 11/11/2026). Linha sem status na planilha
-- entra como "A conferir". Retirada sem data fica sem data.
INSERT INTO public.pop_keys (pop, status, holder_name, holder_kind, taken_at, sort_order) VALUES
  ('ARICANDUVA', 'Base', NULL, NULL, NULL, 1),
  ('CAÇULA', 'Base', NULL, NULL, NULL, 2),
  ('CAMBIO', 'Base', NULL, NULL, NULL, 3),
  ('CIDADE TIRADENTES 1', 'Base', NULL, NULL, NULL, 4),
  ('CIDADE TIRADENTES 2', 'Base', NULL, NULL, NULL, 5),
  ('CIDADE TIRADENTES 3', 'Base', NULL, NULL, NULL, 6),
  ('COLUMBIA', 'Base', NULL, NULL, NULL, 7),
  ('CONQUISTA', 'Base', NULL, NULL, NULL, 8),
  ('FERRAZ DE VASCONCELOS 1', 'Retirada', 'Rogério', 'Outro', '2026-09-10 12:00:00-03', 9),
  ('FERRAZ DE VASCONCELOS 2', 'A conferir', NULL, NULL, NULL, 10),
  ('GIULIA', 'Base', NULL, NULL, NULL, 11),
  ('GUAIANASES 1', 'Base', NULL, NULL, NULL, 12),
  ('GUAIANASES 2', 'Base', NULL, NULL, NULL, 13),
  ('GUARULHOS 1', 'Base', NULL, NULL, NULL, 14),
  ('GUARULHOS 2', 'Base', NULL, NULL, NULL, 15),
  ('GUARULHOS 3', 'Base', NULL, NULL, NULL, 16),
  ('GUARULHOS 4', 'Base', NULL, NULL, NULL, 17),
  ('GUARULHOS 5', 'Base', NULL, NULL, NULL, 18),
  ('IGUATEMI', 'Base', NULL, NULL, NULL, 19),
  ('ITAIM PAULISTA', 'Retirada', 'Adriano Jose', 'Outro', NULL, 20),
  ('MOGI DAS CRUZES', 'Retirada', 'Everaldo', 'Outro', '2026-09-18 12:00:00-03', 21),
  ('PALMEIRAS', 'Retirada', 'Lucas', 'Outro', NULL, 22),
  ('RIO GRANDE DA SERRA', 'Base', NULL, NULL, NULL, 23),
  ('SANTA LUZIA', 'Base', NULL, NULL, NULL, 24),
  ('SÃO MATEUS', 'Base', NULL, NULL, NULL, 25),
  ('SÃO RAFAEL', 'Base', NULL, NULL, NULL, 26),
  ('SERTÃOZINHO', 'Base', NULL, NULL, NULL, 27),
  ('SUZANO 1', 'Retirada', 'Lucas', 'Outro', NULL, 28),
  ('TURQUESA', 'Base', NULL, NULL, NULL, 29),
  ('CAÇAPAVA', 'Base', NULL, NULL, NULL, 30),
  ('PENHA', 'Retirada', 'Mauro GIGA', 'Outro', '2026-09-12 12:00:00-03', 31),
  ('SÃO MIGUEL PAULISTA', 'Base', NULL, NULL, NULL, 32),
  ('TAUBATÉ 2', 'A conferir', NULL, NULL, NULL, 33),
  ('SÃO JOSÉ DOS CAMPOS', 'A conferir', NULL, NULL, NULL, 34),
  ('JACAREÍ', 'Base', NULL, NULL, NULL, 35),
  ('TAUBATÉ 1', 'A conferir', NULL, NULL, NULL, 36),
  ('VITÓRIA', 'Base', NULL, NULL, NULL, 37),
  ('EVOLUTION \ SAO BERNADO', 'Base', NULL, NULL, NULL, 38),
  ('PIRAPORINHA', 'A conferir', NULL, NULL, NULL, 39),
  ('SERRARIA', 'Base', NULL, NULL, NULL, 40)
ON CONFLICT (pop) DO NOTHING;
