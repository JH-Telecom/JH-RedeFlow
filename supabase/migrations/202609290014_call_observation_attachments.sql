CREATE TABLE IF NOT EXISTS public.call_observation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.call_observations(id) ON DELETE CASCADE,
  file_name varchar(255) NOT NULL,
  mime_type varchar(255) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  content_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_observation_attachments_observation_idx ON public.call_observation_attachments(observation_id, created_at ASC);
ALTER TABLE public.call_observation_attachments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.call_observation_attachments TO service_role;