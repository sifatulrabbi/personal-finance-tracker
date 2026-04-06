CREATE TABLE people (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT people_household_name_unique UNIQUE (household_id, name)
);

CREATE INDEX people_household_id_idx ON people (household_id);

CREATE UNIQUE INDEX people_one_default_per_household_idx
  ON people (household_id)
  WHERE is_default = TRUE;
