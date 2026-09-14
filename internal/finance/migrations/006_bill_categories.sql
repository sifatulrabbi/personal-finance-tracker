CREATE TABLE bill_occurrences_with_categories (
 id TEXT PRIMARY KEY,
 schedule_id TEXT NOT NULL REFERENCES recurring_schedules(id),
 due_date TEXT NOT NULL,
 wallet_id TEXT NOT NULL REFERENCES wallets(id),
 amount TEXT NOT NULL,
 name TEXT NOT NULL,
 note TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'due' CHECK(status IN ('due','paid','skipped')),
 transaction_id TEXT UNIQUE REFERENCES transactions(id),
 category_id TEXT NOT NULL DEFAULT 'others-expense' REFERENCES categories(id),
 UNIQUE(schedule_id,due_date)
);
INSERT INTO bill_occurrences_with_categories(id,schedule_id,due_date,wallet_id,amount,name,note,status,transaction_id)
 SELECT id,schedule_id,due_date,wallet_id,amount,name,note,status,transaction_id FROM bill_occurrences;
DROP TABLE bill_occurrences;
ALTER TABLE bill_occurrences_with_categories RENAME TO bill_occurrences;
