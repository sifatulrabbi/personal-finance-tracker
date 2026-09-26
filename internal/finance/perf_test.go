//go:build perf

// The performance probe is slow to set up, so it runs only with the perf build tag:
//
//	go test -tags perf -run TestPerformanceAtScale -v ./internal/finance/
package finance_test

import (
	"database/sql"
	"fmt"
	"simply-finance/internal/finance"
	"sort"
	"testing"
	"time"
)

const perfRecords = 30_000

// perfDatabase builds a database at migration 010 holding perfRecords expenses in one wallet, ten a
// day from 2018-01-01, written as the store wrote them. Seeding raw rows keeps setup fast and lets
// the same probe run before and after the upgrade: the current Migrate then backfills them.
func perfDatabase(t *testing.T) string {
	t.Helper()
	path := legacyDatabase(t, "010_request_key_ttl.sql", `INSERT INTO wallets(id,name,type,currency,details,credit_limit) VALUES('cash','Cash','bank','BDT','',0),('w2','Two','bank','BDT','',0),('w3','Three','bank','BDT','',0),('w4','Four','physical','BDT','',0),('w5','Five','digital','BDT','',0),('w6','Six','bank','USD','',0);`)
	db, e := sql.Open("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	tx, e := db.Begin()
	if e != nil {
		t.Fatal(e)
	}
	insertTx, _ := tx.Prepare(`INSERT INTO transactions VALUES(?,1,0)`)
	insertRevision, _ := tx.Prepare(`INSERT INTO transaction_revisions VALUES(?,1,?,'user',?)`)
	insertEntry, _ := tx.Prepare(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta) VALUES(?,1,'cash',?)`)
	start := time.Date(2018, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < perfRecords; i++ {
		tid := fmt.Sprintf("t%06d", i)
		date := start.AddDate(0, 0, i/10).Format("2006-01-02")
		created := start.Add(time.Duration(i) * time.Minute).Format("2006-01-02T15:04:05.000000000Z")
		amount := finance.FormatMoney(int64(100 + i%5000))
		payload := fmt.Sprintf(`{"kind":"expense","wallet_id":"cash","amount":%q,"date":%q,"note":"n","reason":"","id":%q,"version":1,"voided":false,"bdt_amount":%q,"actor_email":"old@example.test","created_at":%q}`, amount, date, tid, amount, created)
		for _, step := range []struct {
			st   *sql.Stmt
			args []any
		}{{insertTx, []any{tid}}, {insertRevision, []any{tid, payload, created}}, {insertEntry, []any{tid, -int64(100 + i%5000)}}} {
			if _, e = step.st.Exec(step.args...); e != nil {
				t.Fatal(e)
			}
		}
	}
	if e = tx.Commit(); e != nil {
		t.Fatal(e)
	}
	return path
}

// timeIt returns the median of n runs, which is steadier than the mean on a shared laptop.
func timeIt(t *testing.T, n int, fn func(i int)) time.Duration {
	t.Helper()
	runs := make([]time.Duration, n)
	for i := range runs {
		begin := time.Now()
		fn(i)
		runs[i] = time.Since(begin)
	}
	sort.Slice(runs, func(i, j int) bool { return runs[i] < runs[j] })
	return runs[n/2]
}

func TestPerformanceAtScale(t *testing.T) {
	path := perfDatabase(t)
	begin := time.Now()
	s, e := openPrepared(t, path, func() time.Time { return time.Date(2026, 3, 14, 12, 0, 0, 0, time.UTC) })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	t.Logf("migrate and seed %d records: %v", perfRecords, time.Since(begin))
	u := user(t, s)
	check := func(name string, got, limit time.Duration) {
		t.Logf("%-32s %v", name, got)
		if limit > 0 && got > limit {
			t.Errorf("%s took %v, want at most %v", name, got, limit)
		}
	}
	check("list first page (50)", timeIt(t, 21, func(int) {
		if page, e := s.Transactions(ctx, 50, 0); e != nil || len(page) != 50 {
			t.Fatal(len(page), e)
		}
	}), 10*time.Millisecond)
	check("list offset 29000 (50)", timeIt(t, 5, func(int) {
		if page, e := s.Transactions(ctx, 50, 29000); e != nil || len(page) != 50 {
			t.Fatal(len(page), e)
		}
	}), 0)
	perfExtra(t, s, check)
	check("monthly 2025-06", timeIt(t, 21, func(int) {
		if m, e := s.Monthly(ctx, "2025-06"); e != nil || m.Spent == "0.00" {
			t.Fatal(m, e)
		}
	}), 10*time.Millisecond)
	check("wallets (6)", timeIt(t, 21, func(int) {
		if _, e := s.Wallets(ctx); e != nil {
			t.Fatal(e)
		}
	}), 10*time.Millisecond)
	check("create expense", timeIt(t, 101, func(i int) {
		if _, e := s.CreateTransaction(ctx, u.ID, fmt.Sprint("perf-create-", i), finance.TransactionInput{Kind: "expense", WalletID: "cash", Amount: "1", Date: "2026-03-14"}); e != nil {
			t.Fatal(e)
		}
	}), 10*time.Millisecond)
	check("revise expense", timeIt(t, 21, func(i int) {
		tid := fmt.Sprintf("t%06d", i)
		if _, e := s.ReviseTransaction(ctx, u.ID, "perf-revise-"+tid, tid, 1, finance.TransactionInput{Kind: "expense", WalletID: "cash", Amount: "2", Date: "2018-01-01"}, false); e != nil {
			t.Fatal(e)
		}
	}), 10*time.Millisecond)
	check("summary", timeIt(t, 21, func(int) {
		if _, e := s.Summary(ctx); e != nil {
			t.Fatal(e)
		}
	}), 10*time.Millisecond)
}

// perfExtra measures the cursor-paged list, including a filter for a wallet with little activity,
// whose records the feed order holds far apart.
func perfExtra(t *testing.T, s *finance.Store, check func(string, time.Duration, time.Duration)) {
	t.Helper()
	cursor := ""
	for i := 0; i < 580; i++ {
		p, e := s.TransactionsPage(ctx, finance.TransactionFilter{}, cursor, 50)
		if e != nil || p.NextCursor == nil {
			t.Fatal(i, e)
		}
		cursor = *p.NextCursor
	}
	check("cursor page 581 (50)", timeIt(t, 21, func(int) {
		if p, e := s.TransactionsPage(ctx, finance.TransactionFilter{}, cursor, 50); e != nil || len(p.Items) != 50 {
			t.Fatal(len(p.Items), e)
		}
	}), 10*time.Millisecond)
	check("wallet filter, busy wallet", timeIt(t, 21, func(int) {
		if p, e := s.TransactionsPage(ctx, finance.TransactionFilter{WalletID: "cash"}, "", 50); e != nil || len(p.Items) != 50 {
			t.Fatal(len(p.Items), e)
		}
	}), 10*time.Millisecond)
	check("wallet filter, quiet wallet", timeIt(t, 21, func(int) {
		if p, e := s.TransactionsPage(ctx, finance.TransactionFilter{WalletID: "w2"}, "", 50); e != nil || len(p.Items) != 0 {
			t.Fatal(len(p.Items), e)
		}
	}), 10*time.Millisecond)
	check("category + month filter", timeIt(t, 21, func(int) {
		if p, e := s.TransactionsPage(ctx, finance.TransactionFilter{CategoryID: "others-expense", From: "2020-01-01", To: "2020-01-31"}, "", 50); e != nil || len(p.Items) != 50 {
			t.Fatal(len(p.Items), e)
		}
	}), 10*time.Millisecond)
	check("kind filter, rare kind", timeIt(t, 21, func(int) {
		if p, e := s.TransactionsPage(ctx, finance.TransactionFilter{Kind: "income"}, "", 50); e != nil || len(p.Items) != 0 {
			t.Fatal(len(p.Items), e)
		}
	}), 10*time.Millisecond)
}

// A write costs about the same with 30,000 records as with none: nothing on the write path sums a
// wallet's history.
func TestPerformanceCreateDoesNotGrowWithHistory(t *testing.T) {
	empty := openStore(t)
	u := user(t, empty)
	cash := createWallet(t, empty, u, "cash", "BDT", "", "0")
	create := func(s *finance.Store, u finance.User, wid string) time.Duration {
		return timeIt(t, 101, func(i int) {
			if _, e := s.CreateTransaction(ctx, u.ID, fmt.Sprint("growth-", i), finance.TransactionInput{Kind: "expense", WalletID: wid, Amount: "1", Date: "2026-03-14"}); e != nil {
				t.Fatal(e)
			}
		})
	}
	small := create(empty, u, cash.ID)
	s, e := openPrepared(t, perfDatabase(t), time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	large := create(s, user(t, s), "cash")
	t.Logf("create expense: %v with no history, %v with %d records", small, large, perfRecords)
	if large > 2*small+time.Millisecond {
		t.Errorf("a write with history took %v, against %v without", large, small)
	}
}
