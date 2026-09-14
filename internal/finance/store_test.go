package finance_test

import (
	"context"
	"path/filepath"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

var ctx = context.Background()

func openStore(t *testing.T) *finance.Store {
	t.Helper()
	s, e := finance.Open(filepath.Join(t.TempDir(), "test.sqlite"), func() time.Time { return time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC) })
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	return s
}
func user(t *testing.T, s *finance.Store) finance.User {
	t.Helper()
	u, e := s.EnsureUser(ctx, "sifatul@example.test", "Sifatul")
	if e != nil {
		t.Fatal(e)
	}
	return u
}
func TestWalletOpeningBalanceIsDurableAndRetrySafe(t *testing.T) {
	path := filepath.Join(t.TempDir(), "household.sqlite")
	s, e := finance.Open(path, time.Now)
	if e != nil {
		t.Fatal(e)
	}
	u := user(t, s)
	in := finance.WalletInput{Name: "Cash", Type: "physical", Currency: "BDT", OpeningBalance: "1000.00"}
	w, e := s.CreateWallet(ctx, u.ID, "open-cash", in)
	if e != nil {
		t.Fatal(e)
	}
	again, e := s.CreateWallet(ctx, u.ID, "open-cash", in)
	if e != nil || again.ID != w.ID {
		t.Fatalf("retry: %+v %v", again, e)
	}
	in.Name = "Other"
	if _, e = s.CreateWallet(ctx, u.ID, "open-cash", in); e != finance.ErrConflict {
		t.Fatalf("key mismatch: %v", e)
	}
	if e = s.Close(); e != nil {
		t.Fatal(e)
	}
	s, e = finance.Open(path, time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	ws, e := s.Wallets(ctx)
	if e != nil || len(ws) != 1 || ws[0].Balance != "1000.00" {
		t.Fatalf("wallets: %+v %v", ws, e)
	}
}
func createWallet(t *testing.T, s *finance.Store, u finance.User, name, currency, card, opening string) finance.Wallet {
	t.Helper()
	kind := "bank"
	if card != "" {
		kind = "card"
	}
	w, e := s.CreateWallet(ctx, u.ID, "wallet-"+name, finance.WalletInput{Name: name, Type: kind, CardType: card, Currency: currency, OpeningBalance: opening})
	if e != nil {
		t.Fatal(e)
	}
	return w
}
func TestIncomeExpenseAndCorrectionsPreserveHistory(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	cash := createWallet(t, s, u, "cash", "BDT", "", "1000")
	input := finance.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "125.50", Date: "2026-09-14", Note: "Groceries"}
	record, e := s.CreateTransaction(ctx, u.ID, "groceries", input)
	if e != nil {
		t.Fatal(e)
	}
	input.Amount = "100.00"
	input.Reason = "Receipt correction"
	edited, e := s.ReviseTransaction(ctx, u.ID, "edit", record.ID, 1, input, false)
	if e != nil || edited.Version != 2 {
		t.Fatalf("edit: %+v %v", edited, e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "stale", record.ID, 1, input, false); e != finance.ErrConflict {
		t.Fatalf("stale edit: %v", e)
	}
	ws, e := s.Wallets(ctx)
	if e != nil || ws[0].Balance != "900.00" {
		t.Fatalf("balance: %+v %v", ws, e)
	}
	history, e := s.History(ctx, record.ID)
	if e != nil || len(history) != 2 || history[0].Amount != "125.50" || history[1].ActorEmail != u.Email {
		t.Fatalf("history: %+v %v", history, e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "void", record.ID, 2, finance.TransactionInput{Reason: "Duplicate receipt"}, true); e != nil {
		t.Fatal(e)
	}
	ws, e = s.Wallets(ctx)
	if e != nil || ws[0].Balance != "1000.00" {
		t.Fatalf("void balance: %+v %v", ws, e)
	}
}
func TestCreditPurchaseAndRepaymentAreNotDoubleCounted(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	bank := createWallet(t, s, u, "bank", "BDT", "", "10000")
	card := createWallet(t, s, u, "card", "BDT", "credit", "0")
	if _, e := s.CreateTransaction(ctx, u.ID, "purchase", finance.TransactionInput{Kind: "expense", WalletID: card.ID, Amount: "2000", Date: "2026-09-14"}); e != nil {
		t.Fatal(e)
	}
	repayment, e := s.CreateTransaction(ctx, u.ID, "repayment", finance.TransactionInput{Kind: "transfer", WalletID: bank.ID, ToWalletID: card.ID, Amount: "1500", Date: "2026-09-14", Note: "Paid manually"})
	if e != nil {
		t.Fatal(e)
	}
	if repayment.Kind != "transfer" {
		t.Fatal("repayment recorded as expense")
	}
	ws, e := s.Wallets(ctx)
	if e != nil {
		t.Fatal(e)
	}
	for _, w := range ws {
		if w.ID == bank.ID && w.Balance != "8500.00" {
			t.Fatalf("bank %+v", w)
		}
		if w.ID == card.ID && (w.Debt != "500.00" || w.Balance != "0.00") {
			t.Fatalf("card %+v", w)
		}
	}
}
func TestRatesAreSnapshottedAndCrossCurrencyTransfersUseActualAmounts(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	usd := createWallet(t, s, u, "USD", "USD", "", "100")
	bdt := createWallet(t, s, u, "BDT", "BDT", "", "0")
	input := finance.TransactionInput{Kind: "expense", WalletID: usd.ID, Amount: "1", Date: "2026-09-14"}
	if _, e := s.CreateTransaction(ctx, u.ID, "no-rate", input); e != finance.ErrInvalid {
		t.Fatalf("missing rate: %v", e)
	}
	if _, e := s.SetRate(ctx, u.ID, "rate-1", "120", 1); e != nil {
		t.Fatal(e)
	}
	r, e := s.CreateTransaction(ctx, u.ID, "usd-expense", input)
	if e != nil || r.Rate != "120.000000" || r.BDTAmount != "120.00" {
		t.Fatalf("expense: %+v %v", r, e)
	}
	if _, e = s.SetRate(ctx, u.ID, "rate-2", "125", 2); e != nil {
		t.Fatal(e)
	}
	input.Note = "Updated note"
	input.Reason = "Add context"
	r, e = s.ReviseTransaction(ctx, u.ID, "usd-edit", r.ID, 1, input, false)
	if e != nil || r.Rate != "120.000000" {
		t.Fatalf("edit repriced: %+v %v", r, e)
	}
	tr, e := s.CreateTransaction(ctx, u.ID, "exchange", finance.TransactionInput{Kind: "transfer", WalletID: usd.ID, ToWalletID: bdt.ID, Amount: "10", ReceivedAmount: "1240", Rate: "124", Date: "2026-09-14"})
	if e != nil || tr.ReceivedAmount != "1240.00" {
		t.Fatalf("transfer: %+v %v", tr, e)
	}
	ws, e := s.Wallets(ctx)
	if e != nil {
		t.Fatal(e)
	}
	for _, w := range ws {
		if w.ID == usd.ID && w.Balance != "89.00" {
			t.Fatal(w)
		}
		if w.ID == bdt.ID && w.Balance != "1240.00" {
			t.Fatal(w)
		}
	}
}
func TestAdjustmentsAndArchivingUseCurrentWalletVersion(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "cash", "BDT", "", "100")
	adjusted, e := s.AdjustWallet(ctx, u.ID, "adjust", w.ID, w.Version, "80.00", "Counted cash")
	if e != nil || adjusted.Amount != "-20.00" {
		t.Fatalf("adjustment: %+v %v", adjusted, e)
	}
	if _, e = s.AdjustWallet(ctx, u.ID, "stale-adjust", w.ID, w.Version, "90", "Stale count"); e != finance.ErrConflict {
		t.Fatalf("stale: %v", e)
	}
	ws, _ := s.Wallets(ctx)
	w = ws[0]
	w.Name = "Pocket"
	w.Archived = true
	updated, e := s.UpdateWallet(ctx, u.ID, "archive", w)
	if e != nil || !updated.Archived {
		t.Fatalf("archive: %+v %v", updated, e)
	}
	if _, e = s.CreateTransaction(ctx, u.ID, "archived-expense", finance.TransactionInput{Kind: "expense", WalletID: w.ID, Amount: "1", Date: "2026-09-14"}); e != finance.ErrInvalid {
		t.Fatalf("archived expense: %v", e)
	}
	events, e := s.Audit(ctx, 100, 0)
	if e != nil || len(events) != 2 {
		t.Fatalf("audit: %+v %v", events, e)
	}
}
