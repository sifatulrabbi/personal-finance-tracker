package finance_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLegacyRecordsSurviveCategoryMigration(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.sqlite")
	db, e := sql.Open("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	for _, name := range []string{"001_initial.sql", "002_recurring.sql", "003_sessions.sql"} {
		raw, e := os.ReadFile(filepath.Join("migrations", name))
		if e != nil {
			t.Fatal(e)
		}
		if _, e = db.Exec(string(raw)); e != nil {
			t.Fatal(e)
		}
		if _, e = db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY); INSERT INTO schema_migrations VALUES(?)`, name); e != nil {
			t.Fatal(e)
		}
	}
	payload := `{"id":"old","version":1,"kind":"expense","wallet_id":"cash","amount":"25.00","bdt_amount":"25.00","date":"2026-09-14"}`
	_, e = db.Exec(`INSERT INTO users VALUES('user','old@example.test','Old'); INSERT INTO wallets(id,name,type,currency,details,credit_limit) VALUES('cash','Cash','physical','BDT','',0); INSERT INTO transactions VALUES('old',1,0); INSERT INTO transaction_revisions VALUES('old',1,?,'user','2026-09-14T00:00:00Z'); INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta) VALUES('old',1,'cash',-2500);`, payload)
	if e != nil {
		t.Fatal(e)
	}
	_, e = db.Exec(`INSERT INTO recurring_schedules(id,payload) VALUES('schedule','{"name":"Internet","wallet_id":"cash","amount":"10.00","start_date":"2026-09-01","frequency":"monthly"}'); INSERT INTO bill_occurrences(id,schedule_id,due_date,wallet_id,amount,name,note) VALUES('bill','schedule','2026-09-01','cash','10.00','Internet','');`)
	if e != nil {
		t.Fatal(e)
	}
	if e = db.Close(); e != nil {
		t.Fatal(e)
	}
	s, e := openPrepared(t, path, time.Now)
	if e != nil {
		t.Fatal(e)
	}
	records, e := s.Transactions(ctx, 50, 0)
	if e != nil || len(records) != 1 || records[0].CategoryID != "others-expense" {
		t.Fatalf("records: %+v %v", records, e)
	}
	m, e := s.Monthly(ctx, "2026-09")
	if e != nil || m.Spent != "25.00" {
		t.Fatalf("monthly: %+v %v", m, e)
	}
	wallets, e := s.Wallets(ctx)
	if e != nil || wallets[0].Balance != "-25.00" {
		t.Fatalf("balance: %+v %v", wallets, e)
	}
	if e = s.Close(); e != nil {
		t.Fatal(e)
	}
	db, e = sql.Open("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	var category string
	if e = db.QueryRow(`SELECT category_id FROM bill_occurrences WHERE id='bill'`).Scan(&category); e != nil || category != "others-expense" {
		t.Fatalf("legacy bill category: %s %v", category, e)
	}
	var saved string
	if e = db.QueryRow(`SELECT payload FROM transaction_revisions WHERE transaction_id='old'`).Scan(&saved); e != nil || saved != payload {
		t.Fatalf("rewritten history: %s %v", saved, e)
	}
}
