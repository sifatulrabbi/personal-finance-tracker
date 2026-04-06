CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  origin_id UUID REFERENCES origins(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  description TEXT,
  transaction_date DATE NOT NULL,
  transfer_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_type_check CHECK (type IN ('income', 'expense')),
  CONSTRAINT transactions_amount_positive_check CHECK (amount_minor > 0),
  CONSTRAINT transactions_category_required_check CHECK (
    transfer_group_id IS NOT NULL
    OR category_id IS NOT NULL
  ),
  CONSTRAINT transactions_manual_income_origin_check CHECK (
    type <> 'income'
    OR transfer_group_id IS NOT NULL
    OR origin_id IS NOT NULL
  ),
  CONSTRAINT transactions_expense_origin_absent_check CHECK (
    type <> 'expense'
    OR origin_id IS NULL
  )
);

CREATE INDEX transactions_household_id_idx ON transactions (household_id);

CREATE INDEX transactions_household_date_idx
  ON transactions (household_id, transaction_date DESC, created_at DESC);

CREATE INDEX transactions_household_person_idx
  ON transactions (household_id, person_id);

CREATE INDEX transactions_household_account_idx
  ON transactions (household_id, account_id);

CREATE INDEX transactions_household_category_idx
  ON transactions (household_id, category_id);

CREATE INDEX transactions_household_origin_idx
  ON transactions (household_id, origin_id);

CREATE INDEX transactions_household_transfer_group_idx
  ON transactions (household_id, transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;
