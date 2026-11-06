-- Lote 4 (equipe).
-- Status personalizado (emoji + texto, opcionalmente ate uma hora), na mesma linha da foto/banner/apelido.
ALTER TABLE public.user_avatars ADD COLUMN IF NOT EXISTS status_text text;
ALTER TABLE public.user_avatars ADD COLUMN IF NOT EXISTS status_emoji text;
ALTER TABLE public.user_avatars ADD COLUMN IF NOT EXISTS status_until timestamptz;

-- Avisos por pessoa (por enquanto: mencoes @Nome nas observacoes), ate a pessoa marcar como lido.
-- So o backend (service role) le e grava: RLS ligado e sem politicas para anon/authenticated.
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  href text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx ON public.user_notifications (user_id, created_at DESC) WHERE read_at IS NULL;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
