CREATE TABLE users (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  name TEXT,
  workos_user_id TEXT,
  is_drafted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX users_household_id_idx ON users (household_id);

CREATE UNIQUE INDEX users_workos_user_id_unique_idx
  ON users (workos_user_id)
  WHERE workos_user_id IS NOT NULL;
