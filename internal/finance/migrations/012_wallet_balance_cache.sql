-- ADR 0012: wallets.balance_minor caches SUM(wallet_entries.delta) so a write does not re-sum a
-- wallet's whole history. Entries stay the source of truth (ADR 0002): they are append-only, and
-- the cache changes only through this trigger, inside the transaction that inserts the entry.
ALTER TABLE wallets ADD COLUMN balance_minor INTEGER NOT NULL DEFAULT 0;
UPDATE wallets SET balance_minor = COALESCE((SELECT SUM(delta) FROM wallet_entries WHERE wallet_id = wallets.id), 0);
CREATE TRIGGER wallet_entries_cache_balance AFTER INSERT ON wallet_entries BEGIN
 UPDATE wallets SET balance_minor = balance_minor + NEW.delta WHERE id = NEW.wallet_id;
END;
CREATE TRIGGER wallet_entries_append_only_update BEFORE UPDATE ON wallet_entries BEGIN
 SELECT RAISE(ABORT, 'wallet entries are append-only');
END;
CREATE TRIGGER wallet_entries_append_only_delete BEFORE DELETE ON wallet_entries BEGIN
 SELECT RAISE(ABORT, 'wallet entries are append-only');
END;

-- Corrections and voids read one revision's entries; balances sum one wallet's deltas.
CREATE INDEX wallet_entries_revision ON wallet_entries(transaction_id, version);
DROP INDEX wallet_entries_wallet;
CREATE INDEX wallet_entries_wallet_delta ON wallet_entries(wallet_id, delta);
CREATE INDEX bill_occurrences_status_due ON bill_occurrences(status, due_date);
