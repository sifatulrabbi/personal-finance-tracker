-- Metadata edits (name, details, credit limit, archive) keep using wallets.version; balance
-- changes now bump balance_version instead, so a rename does not conflict with spending.
ALTER TABLE wallets ADD COLUMN balance_version INTEGER NOT NULL DEFAULT 1;
UPDATE wallets SET balance_version=version;
