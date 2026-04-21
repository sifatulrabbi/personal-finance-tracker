CREATE TABLE accounts(
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id)
ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  initial_balance_minor BIGINT NOT NULL DEFAULT 0,
  current_balance_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() CONSTRAINT accounts_household_name_unique UNIQUE(household_id,
  name)
);
CREATE INDEX accounts_household_id_idx
ON accounts(household_id);
