ALTER TABLE calls ADD COLUMN IF NOT EXISTS source varchar(30);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_identity varchar(255);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_identifiers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_file_id varchar(255);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_file_name varchar(255);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_reference_date date;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_payload jsonb;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_fingerprint varchar(64);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_processed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS calls_source_identity_idx ON calls(source, source_identity) WHERE source IS NOT NULL AND source_identity IS NOT NULL;
CREATE INDEX IF NOT EXISTS calls_source_reference_idx ON calls(source, source_reference_date DESC) WHERE source IS NOT NULL;

ALTER TABLE call_logs ALTER COLUMN user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS google_drive_call_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  source_identity varchar(255) NOT NULL,
  file_id varchar(255),
  file_name varchar(255) NOT NULL,
  reference_date date,
  fingerprint varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_drive_call_snapshots_call_idx ON google_drive_call_snapshots(call_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS google_drive_call_snapshots_identity_idx ON google_drive_call_snapshots(source_identity, processed_at DESC);

CREATE TABLE IF NOT EXISTS google_drive_sync_runs (
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

CREATE INDEX IF NOT EXISTS google_drive_sync_runs_finished_idx ON google_drive_sync_runs(finished_at DESC);