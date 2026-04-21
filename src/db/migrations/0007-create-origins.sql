CREATE TABLE origins(
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id)
ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() CONSTRAINT origins_household_name_unique UNIQUE(household_id,
  name)
);
CREATE INDEX origins_household_id_idx
ON origins(household_id);
