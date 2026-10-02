CREATE TABLE IF NOT EXISTS user_avatars (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);