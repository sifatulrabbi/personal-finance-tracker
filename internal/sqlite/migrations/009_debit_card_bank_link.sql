-- A debit card is a view onto a bank wallet (ADR 0011): new debit cards link to the bank wallet
-- that holds their money. Existing debit cards stay unlinked (legacy) because the right bank and
-- whether their own entries duplicate it cannot be decided automatically.
ALTER TABLE wallets ADD COLUMN bank_wallet_id TEXT REFERENCES wallets(id);
