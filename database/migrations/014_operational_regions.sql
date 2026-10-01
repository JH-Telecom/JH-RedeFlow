CREATE TABLE IF NOT EXISTS operational_regions (
  region varchar(160) PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);