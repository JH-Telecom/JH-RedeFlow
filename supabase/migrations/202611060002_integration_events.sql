-- Registro da coleta do OFS (export, clusters, fechamentos, relatos da extensao) e dos avisos de prazo no WhatsApp.
-- Alimenta o painel Integracao OFS. O backend apaga sozinho o que tem mais de 14 dias.
-- So o backend (service role) le e grava: RLS ligado e sem politicas para anon/authenticated.
CREATE TABLE IF NOT EXISTS public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  summary text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_events_created_idx ON public.integration_events (created_at DESC);
CREATE INDEX IF NOT EXISTS integration_events_kind_created_idx ON public.integration_events (kind, created_at DESC);
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
