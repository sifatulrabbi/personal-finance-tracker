package finance_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

// mixedHousehold records every kind of write the store makes: openings, income and expenses with
// and without categories, a linked debit card, same- and cross-currency transfers, a correction, a
// void, an adjustment, and a confirmed bill. It returns the wallets by name.
func mixedHousehold(t *testing.T, s *finance.Store, u finance.User) map[string]finance.Wallet {
	t.Helper()
	w := map[string]finance.Wallet{
		"bank":   createWallet(t, s, u, "bank", "BDT", "", "10000"),
		"usd":    createWallet(t, s, u, "usd", "USD", "", "500"),
		"usd2":   createWallet(t, s, u, "usd2", "USD", "", "0"),
		"credit": createWallet(t, s, u, "credit", "BDT", "credit", "100"),
	}
	card, e := s.CreateWallet(ctx, u.ID, "debit-card", finance.WalletInput{Name: "debit", Type: "card", CardType: "debit", BankWalletID: w["bank"].ID})
	if e != nil {
		t.Fatal(e)
	}
	w["debit"] = card
	food, e := s.CreateCategory(ctx, u.ID, "food", finance.CategoryInput{Name: "Food", Type: "expense"})
	if e != nil {
		t.Fatal(e)
	}
	create := func(key string, in finance.TransactionInput) finance.Transaction {
		t.Helper()
		r, e := s.CreateTransaction(ctx, u.ID, key, in)
		if e != nil {
			t.Fatal(key, e)
		}
		return r
	}
	create("salary", finance.TransactionInput{Kind: "income", WalletID: w["bank"].ID, Amount: "5000", Date: "2026-09-01"})
	groceries := create("groceries", finance.TransactionInput{Kind: "expense", WalletID: w["debit"].ID, Amount: "300", Date: "2026-09-02", CategoryID: food.ID})
	create("usd-lunch", finance.TransactionInput{Kind: "expense", WalletID: w["usd"].ID, Amount: "12.34", Rate: "121.5", Date: "2026-09-03"})
	create("usd-move", finance.TransactionInput{Kind: "transfer", WalletID: w["usd"].ID, ToWalletID: w["usd2"].ID, Amount: "10", Date: "2026-09-04"})
	create("exchange", finance.TransactionInput{Kind: "transfer", WalletID: w["usd"].ID, ToWalletID: w["bank"].ID, Amount: "10", ReceivedAmount: "1200", Date: "2026-09-05"})
	create("repay", finance.TransactionInput{Kind: "transfer", WalletID: w["bank"].ID, ToWalletID: w["credit"].ID, Amount: "50", Date: "2026-09-06"})
	taxi := create("taxi", finance.TransactionInput{Kind: "expense", WalletID: w["credit"].ID, Amount: "40", Date: "2026-09-07"})
	if _, e = s.ReviseTransaction(ctx, u.ID, "fix-groceries", groceries.ID, 1, finance.TransactionInput{Kind: "expense", WalletID: w["bank"].ID, Amount: "320", Date: "2026-08-30", Note: "Moved to bank"}, false); e != nil {
		t.Fatal(e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "void-taxi", taxi.ID, 1, finance.TransactionInput{Reason: "Duplicate"}, true); e != nil {
		t.Fatal(e)
	}
	bank, _ := s.Wallet(ctx, w["bank"].ID)
	if _, e = s.AdjustWallet(ctx, u.ID, "count", bank.ID, bank.BalanceVersion, "15000", "Counted"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.CreateSchedule(ctx, u.ID, "rent", finance.ScheduleInput{Name: "Rent", WalletID: w["bank"].ID, Amount: "700", Frequency: "monthly", StartDate: "2026-09-01"}); e != nil {
		t.Fatal(e)
	}
	due, e := s.Due(ctx)
	if e != nil || len(due) != 1 {
		t.Fatal(due, e)
	}
	if _, e = s.ConfirmBill(ctx, u.ID, "pay-rent", due[0].ID, finance.PaymentInput{}); e != nil {
		t.Fatal(e)
	}
	return w
}

// Every write stores a transaction's typed columns and the wallet's cached balance in the same
// transaction as its revision and entries, and both always equal what the payloads and entries say.
func TestDerivedStateMatchesPayloadsAfterMixedWrites(t *testing.T) {
	s, _, path := clockedStore(t)
	u := user(t, s)
	w := mixedHousehold(t, s, u)
	if e := s.VerifyDerivedState(ctx); e != nil {
		t.Fatal(e)
	}
	db := rawDB(t, path)
	var kind, wallet string
	var category sql.NullString
	var bdt sql.NullInt64
	var voided bool
	if e := db.QueryRow(`SELECT kind,wallet_id,category_id,bdt_minor,voided FROM transactions WHERE date='2026-09-03'`).Scan(&kind, &wallet, &category, &bdt, &voided); e != nil {
		t.Fatal(e)
	}
	if kind != "expense" || wallet != w["usd"].ID || category.String != "others-expense" || bdt.Int64 != 149931 || voided {
		t.Fatalf("USD expense columns: %s %s %v %v %v", kind, wallet, category, bdt, voided)
	}
	// A USD transfer without a rate has no BDT value.
	if e := db.QueryRow(`SELECT bdt_minor FROM transactions WHERE date='2026-09-04'`).Scan(&bdt); e != nil || bdt.Valid {
		t.Fatalf("USD transfer BDT: %v %v", bdt, e)
	}
	// The cache is checked, not trusted: a drifted column or balance is reported.
	if _, e := db.Exec(`UPDATE transactions SET bdt_minor=bdt_minor+1 WHERE date='2026-09-03'`); e != nil {
		t.Fatal(e)
	}
	if e := s.VerifyDerivedState(ctx); e == nil {
		t.Fatal("a changed bdt_minor was not reported")
	}
	if _, e := db.Exec(`UPDATE transactions SET bdt_minor=bdt_minor-1 WHERE date='2026-09-03'; UPDATE wallets SET balance_minor=balance_minor+1 WHERE id=?`, w["bank"].ID); e != nil {
		t.Fatal(e)
	}
	if e := s.VerifyDerivedState(ctx); e == nil {
		t.Fatal("a drifted cached balance was not reported")
	}
}

func rawDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, e := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// Wallet entries are the balance source of truth (ADR 0002), and the cached balance is derived from
// them by an insert trigger, so entries can only be appended.
func TestWalletEntriesAreAppendOnly(t *testing.T) {
	s, _, path := clockedStore(t)
	u := user(t, s)
	createWallet(t, s, u, "cash", "BDT", "", "100")
	db := rawDB(t, path)
	for _, statement := range []string{`UPDATE wallet_entries SET delta=delta+1`, `DELETE FROM wallet_entries`} {
		if _, e := db.Exec(statement); e == nil {
			t.Errorf("%s was allowed", statement)
		}
	}
}

// Reads use their own read-only connections, so they finish while another connection holds the
// write lock, and each read sees one committed snapshot.
func TestReadsDoNotWaitForAWriter(t *testing.T) {
	s, _, path := clockedStore(t)
	u := user(t, s)
	cash := createWallet(t, s, u, "cash", "BDT", "", "100")
	db := rawDB(t, path)
	conn, e := db.Conn(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer conn.Close()
	if _, e = conn.ExecContext(ctx, `BEGIN IMMEDIATE; UPDATE wallets SET name='Uncommitted' WHERE id=?`, cash.ID); e != nil {
		t.Fatal(e)
	}
	defer conn.ExecContext(ctx, `ROLLBACK`)
	quick, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	reads := map[string]func() error{
		"wallets":      func() error { _, e := s.Wallets(quick); return e },
		"transactions": func() error { _, e := s.TransactionsPage(quick, finance.TransactionFilter{}, "", 10); return e },
		"monthly":      func() error { _, e := s.Monthly(quick, "2026-09"); return e },
		"summary":      func() error { _, e := s.Summary(quick); return e },
		"schedules":    func() error { _, e := s.Schedules(quick); return e },
		"paid bills":   func() error { _, e := s.Bills(quick, "paid", 10, 0); return e },
		"audit":        func() error { _, e := s.AuditPage(quick, "", 10); return e },
		"health":       func() error { return s.Health(quick) },
	}
	for name, fn := range reads {
		begin := time.Now()
		if e := fn(); e != nil || time.Since(begin) > 500*time.Millisecond {
			t.Errorf("%s while a writer holds the lock: %v after %v", name, e, time.Since(begin))
		}
	}
	w, e := s.Wallet(quick, cash.ID)
	if e != nil || w.Name != "cash" {
		t.Fatalf("read an uncommitted change: %+v %v", w, e)
	}
}

// A cancelled request stops its write and changes nothing.
func TestCancelledWriteChangesNothing(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	cash := createWallet(t, s, u, "cash", "BDT", "", "100")
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, e := s.CreateTransaction(cancelled, u.ID, "late", finance.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "1", Date: "2026-09-14"}); !errors.Is(e, context.Canceled) {
		t.Fatalf("cancelled write: %v", e)
	}
	if w, _ := s.Wallet(ctx, cash.ID); w.Balance != "100.00" {
		t.Fatalf("balance after a cancelled write: %s", w.Balance)
	}
}

func pageAll(t *testing.T, s *finance.Store, f finance.TransactionFilter, limit int) []finance.Transaction {
	t.Helper()
	out, cursor := []finance.Transaction{}, ""
	for pages := 0; ; pages++ {
		p, e := s.TransactionsPage(ctx, f, cursor, limit)
		if e != nil || pages > 1000 {
			t.Fatal(e, pages)
		}
		out = append(out, p.Items...)
		if p.NextCursor == nil {
			return out
		}
		cursor = *p.NextCursor
	}
}

func ids(records []finance.Transaction) []string {
	out := []string{}
	for _, r := range records {
		out = append(out, r.ID)
	}
	return out
}

// Cursor pages walk the same order as the deprecated offset list, with voided records opt-in.
func TestCursorPagesFollowTheListOrder(t *testing.T) {
	s, c, _ := clockedStore(t)
	u := user(t, s)
	mixedHousehold(t, s, u)
	// Records written at one instant are ordered by write position.
	for i := 0; i < 3; i++ {
		c.Set(time.Date(2026, 9, 14, 13, 0, 0, 0, time.UTC))
		cash := createWallet(t, s, u, fmt.Sprint("same-instant-", i), "BDT", "", "1")
		_ = cash
	}
	all, e := s.Transactions(ctx, 200, 0)
	if e != nil {
		t.Fatal(e)
	}
	for _, limit := range []int{1, 2, 3, 7, 200} {
		got := pageAll(t, s, finance.TransactionFilter{IncludeVoided: true}, limit)
		if fmt.Sprint(ids(got)) != fmt.Sprint(ids(all)) {
			t.Fatalf("limit %d:\n%v\nwant\n%v", limit, ids(got), ids(all))
		}
	}
	current := pageAll(t, s, finance.TransactionFilter{}, 4)
	if len(current) != len(all)-1 {
		t.Fatalf("voided records are listed only on request: %d of %d", len(current), len(all))
	}
	for _, r := range current {
		if r.Voided {
			t.Fatalf("voided record listed: %+v", r)
		}
	}
}

// A cursor is a position, not an offset: records added between pages, dated before or after the
// position, never make a page repeat or skip a record that existed when paging began.
func TestCursorPagesAreStableUnderInserts(t *testing.T) {
	s, c, _ := clockedStore(t)
	u := user(t, s)
	cash := createWallet(t, s, u, "cash", "BDT", "", "100000")
	for i := 0; i < 30; i++ {
		c.Set(time.Date(2026, 9, 14, 12, 0, i, 0, time.UTC))
		if _, e := s.CreateTransaction(ctx, u.ID, fmt.Sprint("seed-", i), finance.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "1", Date: fmt.Sprintf("2026-09-%02d", 1+i%10)}); e != nil {
			t.Fatal(e)
		}
	}
	before, e := s.Transactions(ctx, 200, 0)
	if e != nil {
		t.Fatal(e)
	}
	seen, cursor := map[string]int{}, ""
	for page := 0; ; page++ {
		p, e := s.TransactionsPage(ctx, finance.TransactionFilter{}, cursor, 4)
		if e != nil {
			t.Fatal(e)
		}
		for _, r := range p.Items {
			seen[r.ID]++
		}
		if p.NextCursor == nil {
			break
		}
		cursor = *p.NextCursor
		// Between pages: one record dated before everything, one after, one on the same dates.
		c.Set(time.Date(2026, 9, 14, 13, 0, page, 0, time.UTC))
		for j, date := range []string{"2026-08-01", "2026-09-30", fmt.Sprintf("2026-09-%02d", 1+page%10)} {
			if _, e = s.CreateTransaction(ctx, u.ID, fmt.Sprint("between-", page, "-", j), finance.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "1", Date: date}); e != nil {
				t.Fatal(e)
			}
		}
	}
	for _, r := range before {
		if seen[r.ID] != 1 {
			t.Fatalf("record %s (%s) seen %d times", r.ID, r.Date, seen[r.ID])
		}
	}
	for id, n := range seen {
		if n != 1 {
			t.Fatalf("record %s seen %d times", id, n)
		}
	}
}

func TestTransactionFilters(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := mixedHousehold(t, s, u)
	count := func(f finance.TransactionFilter) []finance.Transaction {
		t.Helper()
		return pageAll(t, s, f, 3)
	}
	// A bank wallet's list includes records made with its linked debit card, which move its
	// balance, and transfers into it.
	debitSpend, e := s.CreateTransaction(ctx, u.ID, "card-spend", finance.TransactionInput{Kind: "expense", WalletID: w["debit"].ID, Amount: "5", Date: "2026-09-10"})
	if e != nil {
		t.Fatal(e)
	}
	bank := count(finance.TransactionFilter{WalletID: w["bank"].ID})
	has := func(list []finance.Transaction, id string) bool {
		for _, r := range list {
			if r.ID == id {
				return true
			}
		}
		return false
	}
	if !has(bank, debitSpend.ID) {
		t.Fatalf("bank list lacks its debit card's expense: %v", ids(bank))
	}
	for _, r := range bank {
		named := r.WalletID == w["bank"].ID || r.ToWalletID == w["bank"].ID || r.WalletID == w["debit"].ID
		if !named {
			t.Fatalf("bank list has an unrelated record: %+v", r)
		}
	}
	if card := count(finance.TransactionFilter{WalletID: w["debit"].ID}); len(card) != 1 || card[0].ID != debitSpend.ID {
		t.Fatalf("debit card list: %+v", card)
	}
	usd2 := count(finance.TransactionFilter{WalletID: w["usd2"].ID})
	if len(usd2) != 2 || usd2[0].Kind != "opening" || usd2[1].Kind != "transfer" {
		t.Fatalf("destination wallet list: %+v", usd2)
	}
	for _, r := range count(finance.TransactionFilter{Kind: "transfer"}) {
		if r.Kind != "transfer" {
			t.Fatalf("kind filter: %+v", r)
		}
	}
	food := count(finance.TransactionFilter{CategoryID: "others-expense", From: "2026-09-03", To: "2026-09-10"})
	if len(food) != 2 || food[0].ID != debitSpend.ID || food[1].Date != "2026-09-03" {
		t.Fatalf("category and date filter: %+v", food)
	}
	if voided := count(finance.TransactionFilter{WalletID: w["credit"].ID, Kind: "expense", IncludeVoided: true}); len(voided) != 1 || !voided[0].Voided {
		t.Fatalf("voided on request: %+v", voided)
	}
	for field, f := range map[string]finance.TransactionFilter{
		"kind": {Kind: "gift"},
		"from": {From: "2026-9-1"},
		"to":   {From: "2026-09-10", To: "2026-09-01"},
	} {
		var fe *finance.Error
		if _, e := s.TransactionsPage(ctx, f, "", 10); !errors.As(e, &fe) || fe.Field != field {
			t.Errorf("%s: %v", field, e)
		}
	}
	for _, cursor := range []string{"not base64!", "e30", "eyJkIjoiMjAyNi0wOS0wMSJ9"} {
		var fe *finance.Error
		if _, e := s.TransactionsPage(ctx, finance.TransactionFilter{}, cursor, 10); !errors.As(e, &fe) || fe.Field != "cursor" {
			t.Errorf("cursor %q: %v", cursor, e)
		}
	}
	var fe *finance.Error
	if _, e := s.TransactionsPage(ctx, finance.TransactionFilter{}, "", 201); !errors.As(e, &fe) || fe.Field != "limit" {
		t.Errorf("limit: %v", e)
	}
}

func TestAuditCursorPages(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	mixedHousehold(t, s, u)
	all, e := s.Audit(ctx, 200, 0)
	if e != nil || len(all) < 5 {
		t.Fatal(len(all), e)
	}
	got, cursor := []int64{}, ""
	for {
		p, e := s.AuditPage(ctx, cursor, 2)
		if e != nil {
			t.Fatal(e)
		}
		for _, a := range p.Items {
			got = append(got, a.ID)
		}
		if p.NextCursor == nil {
			break
		}
		cursor = *p.NextCursor
	}
	want := []int64{}
	for _, a := range all {
		want = append(want, a.ID)
	}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("audit pages %v, want %v", got, want)
	}
}
