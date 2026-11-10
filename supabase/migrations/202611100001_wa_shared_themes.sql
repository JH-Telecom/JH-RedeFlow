-- Temas do WhatsApp publicados pela equipe (extensao JH RedeFlow): quem cria um tema pode publicar e os outros baixam.
-- So o backend (service_role) le e grava; RLS ligado e sem politicas.
CREATE TABLE IF NOT EXISTS public.wa_shared_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  dark boolean NOT NULL DEFAULT false,
  colors jsonb NOT NULL,
  image text,
  has_image boolean GENERATED ALWAYS AS (image IS NOT NULL) STORED,
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  downloads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_shared_themes_created_idx ON public.wa_shared_themes(created_at DESC);
ALTER TABLE public.wa_shared_themes ENABLE ROW LEVEL SECURITY;
