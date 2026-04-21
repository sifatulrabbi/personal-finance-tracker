CREATE TABLE currencies(
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id)
ON DELETE RESTRICT,
  code TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  rate_to_bdt_minor BIGINT NOT NULL,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() CONSTRAINT currencies_household_code_unique UNIQUE(
    household_id,
    code
  ),
  CONSTRAINT currencies_rate_positive_check CHECK(rate_to_bdt_minor > 0)
);
CREATE INDEX currencies_household_id_idx
ON currencies(household_id);
-- Enforces exactly one base currency per household. Mirrors the pattern used
-- by people_one_default_per_household_idx.
CREATE UNIQUE INDEX currencies_one_base_per_household_idx
ON currencies(household_id)
WHERE
  is_base = TRUE;
