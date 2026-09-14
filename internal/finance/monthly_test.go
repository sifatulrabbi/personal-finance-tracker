package finance_test

import (
	"fmt"
	"path/filepath"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

func TestDefaultMonthUsesDhakaAndEmptyTargetIsNotZero(t *testing.T) {
	s, e := finance.Open(filepath.Join(t.TempDir(), "month.sqlite"), func() time.Time { return time.Date(2026, 9, 30, 19, 0, 0, 0, time.UTC) })
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
	if len(m.Categories) != 2 || m.Categories[0].Spent != "200.00" || m.Categories[0].Percentage != "25.00" {
		t.Fatalf("rows: %+v", m.Categories)
	}
	in.CategoryID = ""
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
	if e != nil || m.Spent != "600.00" || m.Categories[0].Percentage != "0.00" {
		t.Fatalf("void: %+v %v", m, e)
	}
	empty, e := s.Monthly(ctx, "2026-08")
	if e != nil || empty.Spent != "0.00" || empty.Categories[0].Percentage != "0.00" {
		t.Fatalf("empty: %+v %v", empty, e)
	}
}

func TestMonthlyTargetsAreCopiedOnceAndVersioned(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	first, e := s.Monthly(ctx, "2026-09")
	if e != nil {
		t.Fatal(e)
	}
	target, e := s.SetMonthlyTarget(ctx, u.ID, "target", "2026-09", "40000", first.Target.Version)
	if e != nil || target.Amount != "40000.00" {
		t.Fatalf("target: %+v %v", target, e)
	}
	next, e := s.Monthly(ctx, "2026-10")
	if e != nil || next.Target.Amount != "40000.00" {
		t.Fatalf("copy: %+v %v", next, e)
	}
	if _, e = s.SetMonthlyTarget(ctx, u.ID, "stale", "2026-09", "50000", first.Target.Version); e != finance.ErrConflict {
		t.Fatalf("stale: %v", e)
	}
	if _, e = s.SetMonthlyTarget(ctx, u.ID, "change", "2026-09", "50000", target.Version); e != nil {
		t.Fatal(e)
	}
	next, e = s.Monthly(ctx, "2026-10")
	if e != nil || next.Target.Amount != "40000.00" {
		t.Fatalf("independence: %+v %v", next, e)
	}
	if _, e = s.Monthly(ctx, "2026-13"); e != finance.ErrInvalid {
		t.Fatalf("month: %v", e)
	}
}
