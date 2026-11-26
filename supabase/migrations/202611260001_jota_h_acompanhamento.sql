-- Acompanhamento da IA (26/11/2026): de onde veio cada resposta do Jota H (Groq, Gemini ou o cache do dia), quanto a
-- IA demorou e se o SQL precisou ser corrigido; as regras que a IA aprendeu (entram no prompt) e os testes automaticos
-- (pergunta + SQL certo, comparados com o que a IA monta). So o backend le e grava (RLS ligado, sem politicas).
ALTER TABLE public.jota_h_log
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS cached boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repaired boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_ms integer;

CREATE TABLE IF NOT EXISTS public.jota_h_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto text NOT NULL,
  escopo text NOT NULL DEFAULT 'todos' CHECK (escopo IN ('todos', 'lideranca')),
  ativo boolean NOT NULL DEFAULT true,
  autor text,
  origem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.jota_h_regras ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.jota_h_testes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta text NOT NULL,
  sql_esperado text NOT NULL,
  autor text,
  ultimo_resultado text CHECK (ultimo_resultado IN ('ok', 'diferente', 'erro')),
  ultimo_detalhe text,
  ultima_execucao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.jota_h_testes ENABLE ROW LEVEL SECURITY;
