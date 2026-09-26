package finance_test

import (
	"database/sql"
	"fmt"
	"simply-finance/internal/finance"
	"strings"
	"testing"
	"time"
)

// legacyRevisions is synthetic history as the store wrote it before migration 011: opening payloads
// without id or version, an expense from before categories, a linked debit card's expense posted
// to its bank, transfers with and without a BDT value, a negative adjustment, a corrected record,
// a voided record, and BDT values written with fewer than two decimals.
var legacyRevisions = []struct{ tid, payload string }{
	{"open", `{"kind":"opening","wallet_id":"cash","amount":"100.00","date":"2026-01-01"}`},
	{"old", `{"id":"old","version":1,"kind":"expense","wallet_id":"cash","amount":"25.00","bdt_amount":"25.00","date":"2026-02-02"}`},
	{"card", `{"category_id":"food","id":"card","version":1,"kind":"expense","wallet_id":"debit","amount":"30.00","bdt_amount":"30.00","date":"2026-02-04","note":"Card"}`},
	{"exchange", `{"id":"exchange","version":1,"kind":"transfer","wallet_id":"usd","to_wallet_id":"bank","amount":"10.00","received_amount":"1200.00","bdt_amount":"1200.00","date":"2026-02-05"}`},
	{"usd-move", `{"id":"usd-move","version":1,"kind":"transfer","wallet_id":"usd","to_wallet_id":"usd2","amount":"1.00","received_amount":"1.00","bdt_amount":"","date":"2026-02-06"}`},
	{"adjust", `{"id":"adjust","version":1,"kind":"adjustment","wallet_id":"cash","amount":"-5.00","date":"2026-02-07","reason":"Count"}`},
	{"income", `{"id":"income","version":1,"kind":"income","wallet_id":"bank","amount":"7","bdt_amount":"7","date":"2026-02-08"}`},
	{"fixed", `{"id":"fixed","version":1,"kind":"expense","wallet_id":"cash","amount":"10.00","bdt_amount":"10.00","date":"2026-02-01"}`},
	{"fixed", `{"category_id":"food","id":"fixed","version":2,"kind":"expense","wallet_id":"cash","amount":"12.50","bdt_amount":"12.5","date":"2026-02-03"}`},
	{"void", `{"id":"void","version":1,"kind":"expense","wallet_id":"cash","amount":"3.00","bdt_amount":"3.00","date":"2026-02-09"}`},
	{"void", `{"id":"void","version":2,"voided":true,"kind":"expense","wallet_id":"cash","amount":"3.00","bdt_amount":"3.00","date":"2026-02-09","reason":"Duplicate"}`},
}

func legacyHistory(extra string) string {
	var b strings.Builder
	b.WriteString(`INSERT INTO categories VALUES('food','expense','Food');
INSERT INTO wallets(id,name,type,card_type,currency,details,credit_limit,bank_wallet_id) VALUES('cash','Cash','physical','','BDT','',0,NULL),('bank','Bank','bank','','BDT','',0,NULL),('usd','USD','bank','','USD','',0,NULL),('usd2','USD 2','bank','','USD','',0,NULL),('debit','Debit','card','debit','BDT','',0,'bank');
INSERT INTO transactions VALUES('open',1,0),('old',1,0),('card',1,0),('exchange',1,0),('usd-move',1,0),('adjust',1,0),('income',1,0),('fixed',2,0),('void',2,1);
`)
	versions := map[string]int{}
	for i, r := range legacyRevisions {
		versions[r.tid]++
		fmt.Fprintf(&b, "INSERT INTO transaction_revisions VALUES('%s',%d,'%s','user','2026-02-10T00:00:%02d.000000000Z');\n", r.tid, versions[r.tid], r.payload, i)
	}
	b.WriteString(`INSERT INTO wallet_entries(id,transaction_id,version,wallet_id,delta,reversal_of) VALUES
 (1,'open',1,'cash',10000,NULL),(2,'old',1,'cash',-2500,NULL),(3,'card',1,'bank',-3000,NULL),
 (4,'exchange',1,'usd',-1000,NULL),(5,'exchange',1,'bank',120000,NULL),(6,'usd-move',1,'usd',-100,NULL),(7,'usd-move',1,'usd2',100,NULL),
 (8,'adjust',1,'cash',-500,NULL),(9,'income',1,'bank',700,NULL),
 (10,'fixed',1,'cash',-1000,NULL),(11,'fixed',2,'cash',1000,10),(12,'fixed',2,'cash',-1250,NULL),
 (13,'void',1,'cash',-300,NULL),(14,'void',2,'cash',300,13);
`)
	return b.String() + extra
}

// Migration 011 backfills the typed columns from each record's current revision exactly as the
// application reads it, and 012 caches each wallet's balance; payloads stay byte-for-byte the same.
func TestUpgradeBackfillsCurrentColumnsFromLegacyPayloads(t *testing.T) {
	path := legacyDatabase(t, "010_request_key_ttl.sql", legacyHistory(""))
	s, e := openPrepared(t, path, func() time.Time { return time.Date(2026, 2, 14, 12, 0, 0, 0, time.UTC) })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	if e = s.VerifyDerivedState(ctx); e != nil {
		t.Fatal(e)
	}
	db := rawDB(t, path)
	type columns struct {
		kind, wallet, to, category string
		bdt                        sql.NullInt64
		voided                     bool
	}
	want := map[string]columns{
		"open":     {"opening", "cash", "", "", sql.NullInt64{}, false},
		"old":      {"expense", "cash", "", "others-expense", sql.NullInt64{Int64: 2500, Valid: true}, false},
		"card":     {"expense", "debit", "", "food", sql.NullInt64{Int64: 3000, Valid: true}, false},
		"exchange": {"transfer", "usd", "bank", "", sql.NullInt64{Int64: 120000, Valid: true}, false},
		"usd-move": {"transfer", "usd", "usd2", "", sql.NullInt64{}, false},
		"adjust":   {"adjustment", "cash", "", "", sql.NullInt64{}, false},
		"income":   {"income", "bank", "", "others-income", sql.NullInt64{Int64: 700, Valid: true}, false},
		"fixed":    {"expense", "cash", "", "food", sql.NullInt64{Int64: 1250, Valid: true}, false},
		"void":     {"expense", "cash", "", "others-expense", sql.NullInt64{Int64: 300, Valid: true}, true},
	}
	for tid, w := range want {
		var got columns
		var to, category sql.NullString
		if e = db.QueryRow(`SELECT kind,wallet_id,to_wallet_id,category_id,bdt_minor,voided FROM transactions WHERE id=?`, tid).Scan(&got.kind, &got.wallet, &to, &category, &got.bdt, &got.voided); e != nil {
			t.Fatal(tid, e)
		}
		got.to, got.category = to.String, category.String
		if got != w {
			t.Errorf("%s: %+v, want %+v", tid, got, w)
		}
	}
	versions := map[string]int{}
	for _, r := range legacyRevisions {
		versions[r.tid]++
		var saved string
		if e = db.QueryRow(`SELECT payload FROM transaction_revisions WHERE transaction_id=? AND version=?`, r.tid, versions[r.tid]).Scan(&saved); e != nil || saved != r.payload {
			t.Fatalf("rewritten history %s: %s %v", r.tid, saved, e)
		}
	}
	for wid, balance := range map[string]string{"cash": "57.50", "bank": "1177.00", "usd": "-11.00", "usd2": "1.00", "debit": "0.00"} {
		if w, e := s.Wallet(ctx, wid); e != nil || w.Balance != balance {
			t.Errorf("%s balance: %+v %v, want %s", wid, w, e, balance)
		}
	}
	m, e := s.Monthly(ctx, "2026-02")
	if e != nil || m.Spent != "67.50" {
		t.Fatalf("monthly: %+v %v", m, e)
	}
	// The list keeps its order: date, then the current revision's time, newest first.
	list, e := s.Transactions(ctx, 50, 0)
	if e != nil {
		t.Fatal(e)
	}
	if got := strings.Join(ids(list), " "); got != "void income adjust usd-move exchange card fixed old open" {
		t.Fatalf("order: %s", got)
	}
	// New writes continue after the backfilled positions.
	u := user(t, s)
	r, e := s.CreateTransaction(ctx, u.ID, "after-upgrade", finance.TransactionInput{Kind: "expense", WalletID: "cash", Amount: "1", Date: "2026-02-09"})
	if e != nil {
		t.Fatal(e)
	}
	if list, _ = s.Transactions(ctx, 1, 0); list[0].ID != r.ID {
		t.Fatalf("new record not first on its date: %+v", list[0])
	}
	if e = s.VerifyDerivedState(ctx); e != nil {
		t.Fatal(e)
	}
}

// A stored payload the application cannot read (here a BDT value with three decimals) stops the
// upgrade before anything is committed, instead of backfilling a value that disagrees with it.
func TestUpgradeStopsOnAPayloadItCannotRead(t *testing.T) {
	bad := `INSERT INTO transactions VALUES('bad',1,0); INSERT INTO transaction_revisions VALUES('bad',1,'{"kind":"expense","wallet_id":"cash","amount":"1.00","bdt_amount":"1.234","date":"2026-02-11"}','user','2026-02-11T00:00:00Z');`
	path := legacyDatabase(t, "010_request_key_ttl.sql", legacyHistory(bad))
	if e := finance.Migrate(path); e == nil || !strings.Contains(e.Error(), "bad") {
		t.Fatalf("migrate: %v", e)
	}
	db := rawDB(t, path)
	var applied int
	if e := db.QueryRow(`SELECT count(*) FROM schema_migrations WHERE name>='011'`).Scan(&applied); e != nil || applied != 0 {
		t.Fatalf("applied after a failed check: %d %v", applied, e)
	}
	if _, e := db.Exec(`SELECT kind FROM transactions`); e == nil {
		t.Fatal("the failed upgrade left new columns behind")
	}
}
