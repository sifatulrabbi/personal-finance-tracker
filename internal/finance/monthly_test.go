package finance_test

import (
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

func TestDefaultMonthUsesDhakaAndEmptyTargetIsNotZero(t *testing.T) {
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "month.sqlite"), func() time.Time { return time.Date(2026, 9, 30, 19, 0, 0, 0, time.UTC) })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	u := user(t, s)
	m, e := s.Monthly(ctx, "")
	if e != nil || m.Month != "2026-10" || m.Target.Amount != "" {
		t.Fatalf("default: %+v %v", m, e)
	}
	zero, e := s.SetMonthlyTarget(ctx, u.ID, "zero", m.Month, "0", m.Target.Version)
	if e != nil || zero.Amount != "0.00" {
		t.Fatalf("zero: %+v %v", zero, e)
	}
	next, e := s.Monthly(ctx, "2026-11")
	if e != nil || next.Target.Amount != "0.00" {
		t.Fatalf("zero copy: %+v %v", next, e)
	}
}

func TestMonthlySpendingUsesLatestExpensesAndSavedRates(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	cash := createWallet(t, s, u, "Cash", "BDT", "", "10000")
	usd := createWallet(t, s, u, "USD", "USD", "", "100")
	c, e := s.CreateCategory(ctx, u.ID, "food", finance.CategoryInput{Name: "Eating out", Type: "expense"})
	if e != nil {
		t.Fatal(e)
	}
	in := finance.TransactionInput{Kind: "expense", WalletID: usd.ID, Amount: "2", Rate: "100", Date: "2026-09-01", CategoryID: c.ID}
	r, e := s.CreateTransaction(ctx, u.ID, "usd", in)
	if e != nil {
		t.Fatal(e)
	}
	for i := 0; i < 60; i++ {
		_, e = s.CreateTransaction(ctx, u.ID, fmt.Sprint("cash", i), finance.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "10", Date: "2026-09-30"})
		if e != nil {
			t.Fatal(e)
		}
	}
	for i, kind := range []string{"income", "expense"} {
		_, e = s.CreateTransaction(ctx, u.ID, fmt.Sprint("excluded", i), finance.TransactionInput{Kind: kind, WalletID: cash.ID, Amount: "500", Date: []string{"2026-09-14", "2026-10-01"}[i]})
		if e != nil {
			t.Fatal(e)
		}
	}
	if _, e = s.SetRate(ctx, u.ID, "rate", "150", 1); e != nil {
		t.Fatal(e)
	}
	m, e := s.Monthly(ctx, "2026-09")
	if e != nil || m.Spent != "800.00" {
		t.Fatalf("monthly: %+v %v", m, e)
	}
	if len(m.Categories) != 11 {
		t.Fatalf("rows: %+v", m.Categories)
	}
	if row := monthlyCategory(t, m, c.ID); row.Spent != "200.00" || row.Percentage != "25.00" {
		t.Fatalf("category spending: %+v", row)
	}
	in.CategoryID = "others-expense"
	in.Rate = ""
	in.Reason = "Correct category"
	revised, e := s.ReviseTransaction(ctx, u.ID, "edit", r.ID, r.Version, in, false)
	if e != nil {
		t.Fatal(e)
	}
	h, e := s.History(ctx, r.ID)
	if e != nil || h[0].CategoryID != c.ID || h[1].CategoryID != "others-expense" {
		t.Fatalf("history: %+v %v", h, e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "void", r.ID, revised.Version, finance.TransactionInput{Reason: "Duplicate"}, true); e != nil {
		t.Fatal(e)
	}
	m, e = s.Monthly(ctx, "2026-09")
	if e != nil || m.Spent != "600.00" || monthlyCategory(t, m, c.ID).Percentage != "0.00" {
		t.Fatalf("void: %+v %v", m, e)
	}
	empty, e := s.Monthly(ctx, "2026-08")
	if e != nil || empty.Spent != "0.00" || monthlyCategory(t, empty, c.ID).Percentage != "0.00" {
		t.Fatalf("empty: %+v %v", empty, e)
	}
}

func monthlyCategory(t *testing.T, month finance.MonthlySpending, id string) finance.CategorySpending {
	t.Helper()
	for _, row := range month.Categories {
		if row.CategoryID == id {
			return row
		}
	}
	t.Fatalf("missing category %s", id)
	return finance.CategorySpending{}
}

// Regression (C5): a month's target was copied only from the immediately preceding saved row, and
// the first read persisted that copy. A gap month lost the target, and peeking at a later month
// froze it as "no target". A month without its own saved target now shows the latest earlier
// saved target, computed on read, and reads never write.
func TestMonthlyTargetsInheritTheLatestEarlierSavedMonth(t *testing.T) {
	path := filepath.Join(t.TempDir(), "targets.sqlite")
	s, e := openPrepared(t, path, func() time.Time { return time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC) })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	u := user(t, s)
	target := func(month string) finance.MonthlyTarget {
		t.Helper()
		m, e := s.Monthly(ctx, month)
		if e != nil {
			t.Fatal(e)
		}
		return m.Target
	}
	// Peek at later months before anything is set.
	if got := target("2026-05"); got.Amount != "" || got.Version != 1 || got.InheritedFrom != "" {
		t.Fatalf("unset: %+v", got)
	}
	jan, e := s.SetMonthlyTarget(ctx, u.ID, "jan", "2026-01", "30000", target("2026-01").Version)
	if e != nil || jan.Amount != "30000.00" || jan.Version != 2 {
		t.Fatalf("jan: %+v %v", jan, e)
	}
	// Across a gap: nobody opened February, and March still carries January's target.
	if got := target("2026-03"); got.Amount != "30000.00" || got.InheritedFrom != "2026-01" || got.Version != 1 {
		t.Fatalf("gap: %+v", got)
	}
	// Peeking at May earlier did not freeze it: setting April now changes what May shows.
	april := target("2026-04")
	if _, e = s.SetMonthlyTarget(ctx, u.ID, "april", "2026-04", "40000", april.Version); e != nil {
		t.Fatal(e)
	}
	if got := target("2026-05"); got.Amount != "40000.00" || got.InheritedFrom != "2026-04" {
		t.Fatalf("after peek: %+v", got)
	}
	// An earlier month's target never flows forward past a month with its own saved target, and a
	// later edit to it flows only into months that have none.
	if _, e = s.SetMonthlyTarget(ctx, u.ID, "jan-edit", "2026-01", "35000", jan.Version); e != nil {
		t.Fatal(e)
	}
	if got := target("2026-02"); got.Amount != "35000.00" {
		t.Fatalf("follow: %+v", got)
	}
	if got := target("2026-05"); got.Amount != "40000.00" {
		t.Fatalf("shadowed: %+v", got)
	}
	// Zero is a saved target and is inherited; stale versions are refused.
	if _, e = s.SetMonthlyTarget(ctx, u.ID, "stale", "2026-04", "1", april.Version); !errors.Is(e, finance.ErrStaleVersion) {
		t.Fatalf("stale: %v", e)
	}
	if _, e = s.Monthly(ctx, "2026-13"); !errors.Is(e, finance.ErrInvalid) {
		t.Fatalf("month: %v", e)
	}
	var rows int
	db, e := sql.Open("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	if e = db.QueryRow(`SELECT count(*) FROM monthly_targets`).Scan(&rows); e != nil || rows != 2 {
		t.Fatalf("reads persisted target rows: %d %v", rows, e)
	}
}
