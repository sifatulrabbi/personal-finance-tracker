-- Monthly targets are now inherited on read from the latest earlier saved month (ADR 0010).
-- Rows written by the old first-read initialization that only recorded "no target" (version 1,
-- no amount) were never set by anyone; dropping them lets those months inherit. Initialized
-- rows with an amount stay as the saved snapshots users have already seen.
DELETE FROM monthly_targets WHERE amount IS NULL AND version=1;
