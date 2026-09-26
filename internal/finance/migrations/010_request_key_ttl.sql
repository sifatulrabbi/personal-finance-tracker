-- Idempotency keys now expire after a TTL (RequestKeyTTL, 30 days) and are pruned on writes.
-- Existing keys are dated at upgrade time so they get the full window.
ALTER TABLE request_keys ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE request_keys SET created_at=CAST(strftime('%s','now') AS INTEGER);
CREATE INDEX request_keys_created ON request_keys(created_at);
