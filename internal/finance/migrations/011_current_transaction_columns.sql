-- ADR 0012: each transaction row carries its current revision's queryable facts as typed columns.
-- Revision payloads stay byte-for-byte unchanged as history evidence; the application writes both
-- in one transaction, and Migrate checks this backfill against the Go reading of every payload.
ALTER TABLE transactions ADD COLUMN kind TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN date TEXT NOT NULL DEFAULT '';
-- wallet_id is the wallet the record names (a debit card stays the card), not the ledger wallet.
ALTER TABLE transactions ADD COLUMN wallet_id TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN to_wallet_id TEXT;
-- NULL for transfers, openings and adjustments; legacy income and expenses resolve to Others.
ALTER TABLE transactions ADD COLUMN category_id TEXT;
-- The saved BDT value in minor units; NULL when the record has none (openings, adjustments, and
-- USD transfers without a rate that did not receive BDT).
ALTER TABLE transactions ADD COLUMN bdt_minor INTEGER;
-- The current revision's instant and write order, which the list order uses after the date.
ALTER TABLE transactions ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;

UPDATE transactions AS t SET
 kind = r.kind,
 date = r.date,
 wallet_id = r.wallet_id,
 to_wallet_id = r.to_wallet_id,
 category_id = CASE WHEN r.kind IN ('income','expense') THEN COALESCE(r.category_id, 'others-' || r.kind) END,
 bdt_minor = CASE
  WHEN r.bdt IS NULL THEN NULL
  WHEN instr(r.bdt, '.') = 0 THEN r.sign * CAST(r.bdt AS INTEGER) * 100
  ELSE r.sign * (CAST(substr(r.bdt, 1, instr(r.bdt, '.') - 1) AS INTEGER) * 100 + CAST(substr(substr(r.bdt, instr(r.bdt, '.') + 1) || '00', 1, 2) AS INTEGER))
 END,
 created_at = r.created_at,
 seq = r.seq
FROM (
 SELECT transaction_id, version, rowid AS seq, created_at,
  json_extract(payload, '$.kind') AS kind,
  json_extract(payload, '$.date') AS date,
  json_extract(payload, '$.wallet_id') AS wallet_id,
  NULLIF(json_extract(payload, '$.to_wallet_id'), '') AS to_wallet_id,
  NULLIF(json_extract(payload, '$.category_id'), '') AS category_id,
  ltrim(NULLIF(json_extract(payload, '$.bdt_amount'), ''), '-') AS bdt,
  CASE WHEN json_extract(payload, '$.bdt_amount') LIKE '-%' THEN -1 ELSE 1 END AS sign
 FROM transaction_revisions
) AS r
WHERE r.transaction_id = t.id AND r.version = t.version;

-- seq orders records written at the same instant and makes every list position unique.
CREATE UNIQUE INDEX transactions_seq ON transactions(seq);
CREATE INDEX transactions_feed ON transactions(date DESC, created_at DESC, seq DESC);
CREATE INDEX transactions_wallet ON transactions(wallet_id, date DESC, created_at DESC, seq DESC);
CREATE INDEX transactions_to_wallet ON transactions(to_wallet_id, date DESC, created_at DESC, seq DESC) WHERE to_wallet_id IS NOT NULL;
CREATE INDEX transactions_category ON transactions(category_id, date DESC, created_at DESC, seq DESC) WHERE category_id IS NOT NULL;
CREATE INDEX transactions_kind ON transactions(kind, date DESC, created_at DESC, seq DESC);
-- Monthly spending reads only current, non-voided expenses; this index answers it without the table.
CREATE INDEX transactions_month_expenses ON transactions(date, category_id, bdt_minor) WHERE kind = 'expense' AND voided = 0;
