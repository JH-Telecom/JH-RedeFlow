-- Temas criados pela equipe (27/11/2026): quem cria um tema ja deixa ele na galeria de todos (sem publicar). Quem usa
-- recebe uma copia no proprio perfil (user_avatars.custom_theme), entao o tema continua valendo mesmo se o autor apagar.
CREATE TABLE IF NOT EXISTS public.team_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  accent text NOT NULL CHECK (accent ~ '^#[0-9a-fA-F]{6}$'),
  side text NOT NULL CHECK (side ~ '^#[0-9a-fA-F]{6}$'),
  background text NOT NULL DEFAULT 'colorido' CHECK (background IN ('colorido', 'neutro')),
  author_id uuid,
  author_name text,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_themes_created_idx ON public.team_themes(created_at DESC);
ALTER TABLE public.team_themes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_avatars ADD COLUMN IF NOT EXISTS custom_theme jsonb;
