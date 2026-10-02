CREATE TABLE IF NOT EXISTS public.user_avatars (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  data_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_avatars ENABLE ROW LEVEL SECURITY;