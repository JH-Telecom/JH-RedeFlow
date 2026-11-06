-- Lote E.
-- Vinculo tecnico <-> usuario do sistema: o usuario ligado ve e atualiza os proprios chamados em "Meus chamados".
-- Tabela separada (e nao uma coluna em technicians) para nada do cadastro de tecnicos depender desta migracao.
CREATE TABLE IF NOT EXISTS public.technician_users (
  technician_id uuid PRIMARY KEY REFERENCES public.technicians(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.technician_users ENABLE ROW LEVEL SECURITY;

-- Modelos de checklist por tipo de chamado (Configuracoes). call_types vazio = vale para todos os tipos.
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  call_types text[] NOT NULL DEFAULT '{}',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
