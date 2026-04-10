ALTER TABLE transactions
  ADD COLUMN original_currency_code TEXT NOT NULL DEFAULT 'BDT',
  ADD COLUMN original_amount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN exchange_rate_to_bdt_minor BIGINT NOT NULL DEFAULT 100;

-- Backfill: for existing rows, original amount = BDT amount
UPDATE transactions SET
  original_amount_minor = amount_minor,
  exchange_rate_to_bdt_minor = 100;
