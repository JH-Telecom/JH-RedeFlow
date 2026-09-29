ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source varchar(30);
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_identity varchar(255);
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_identifiers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_file_id varchar(255);
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_file_name varchar(255);
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_reference_date date;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_payload jsonb;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_fingerprint varchar(64);
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS source_processed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS calls_source_identity_idx ON public.calls(source, source_identity) WHERE source IS NOT NULL AND source_identity IS NOT NULL;
CREATE INDEX IF NOT EXISTS calls_source_reference_idx ON public.calls(source, source_reference_date DESC) WHERE source IS NOT NULL;

ALTER TABLE public.call_logs ALTER COLUMN user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.google_drive_call_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  source_identity varchar(255) NOT NULL,
  file_id varchar(255),
  file_name varchar(255) NOT NULL,
  reference_date date,
  fingerprint varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_drive_call_snapshots_call_idx ON public.google_drive_call_snapshots(call_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS google_drive_call_snapshots_identity_idx ON public.google_drive_call_snapshots(source_identity, processed_at DESC);

CREATE TABLE IF NOT EXISTS public.google_drive_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  files integer NOT NULL DEFAULT 0,
  rows integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  new_records integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  finalised integer NOT NULL DEFAULT 0,
  cancelled integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  unmatched integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS google_drive_sync_runs_finished_idx ON public.google_drive_sync_runs(finished_at DESC);
ALTER TABLE public.google_drive_call_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_drive_sync_runs ENABLE ROW LEVEL SECURITY;