ALTER TABLE calls ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS bairro varchar(160);

CREATE INDEX IF NOT EXISTS calls_bairro_status_opened_idx ON calls(bairro, status, opened_at DESC) WHERE bairro IS NOT NULL;