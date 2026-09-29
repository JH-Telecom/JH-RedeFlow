CREATE TABLE IF NOT EXISTS olt_region_overrides (
  olt varchar(120) PRIMARY KEY,
  region varchar(160) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);