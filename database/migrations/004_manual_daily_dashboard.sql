CREATE TABLE IF NOT EXISTS manual_daily_bases (
  business_date date PRIMARY KEY,
  file_name varchar(255) NOT NULL,
  payload jsonb NOT NULL,
  uploaded_by varchar(255) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);