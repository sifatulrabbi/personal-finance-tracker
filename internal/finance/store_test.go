package finance_test

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

var ctx = context.Background()

func openStore(t *testing.T) *finance.Store {
	t.Helper()
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "test.sqlite"), func() time.Time { return time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC) })
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
	s, e := openPrepared(t, path, time.Now)
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
	if _, e = s.CreateWallet(ctx, u.ID, "open-cash", in); !errors.Is(e, finance.ErrIdempotencyKeyReused) {
		t.Fatalf("key mismatch: %v", e)
	}
	if e = s.Close(); e != nil {
		t.Fatal(e)
	}
	s, e = openPrepared(t, path, time.Now)
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
	input.Reason = ""
	edited, e := s.ReviseTransaction(ctx, u.ID, "edit", record.ID, 1, input, false)
	if e != nil || edited.Version != 2 {
		t.Fatalf("edit: %+v %v", edited, e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "stale", record.ID, 1, input, false); !errors.Is(e, finance.ErrStaleVersion) {
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
func balances(t *testing.T, s *finance.Store) map[string]string {
	t.Helper()
	ws, e := s.Wallets(ctx)
	if e != nil {
		t.Fatal(e)
	}
	out := map[string]string{}
	for _, w := range ws {
		out[w.ID] = w.Balance
	}
	return out
}

// Regression (C2): an archived wallet keeps its balance, so a correction may touch a record on it
// only when that wallet's balance stays the same. Void remains the explicit way to reverse one.
func TestCorrectionsOnArchivedWalletsMustNotChangeTheirBalance(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	closed := createWallet(t, s, u, "closed", "BDT", "", "1000")
	open := createWallet(t, s, u, "open", "BDT", "", "1000")
	usd := createWallet(t, s, u, "usd", "USD", "", "100")
	if _, e := s.SetRate(ctx, u.ID, "rate", "120", 1); e != nil {
		t.Fatal(e)
	}
	expense := finance.TransactionInput{Kind: "expense", WalletID: closed.ID, Amount: "100", Date: "2026-09-14", Note: "Groceris"}
	onClosed, e := s.CreateTransaction(ctx, u.ID, "on-closed", expense)
	if e != nil {
		t.Fatal(e)
	}
	onOpen, e := s.CreateTransaction(ctx, u.ID, "on-open", finance.TransactionInput{Kind: "expense", WalletID: open.ID, Amount: "50", Date: "2026-09-14"})
	if e != nil {
		t.Fatal(e)
	}
	transfer, e := s.CreateTransaction(ctx, u.ID, "transfer", finance.TransactionInput{Kind: "transfer", WalletID: open.ID, ToWalletID: closed.ID, Amount: "10", Date: "2026-09-14"})
	if e != nil {
		t.Fatal(e)
	}
	dollars, e := s.CreateTransaction(ctx, u.ID, "usd", finance.TransactionInput{Kind: "expense", WalletID: usd.ID, Amount: "1", Date: "2026-09-14"})
	if e != nil {
		t.Fatal(e)
	}
	archiveWallet(t, s, u, closed.ID)
	archiveWallet(t, s, u, usd.ID)
	before := balances(t, s)

	expense.Note = "Groceries"
	expense.Date = "2026-09-13"
	if onClosed, e = s.ReviseTransaction(ctx, u.ID, "fix-note", onClosed.ID, 1, expense, false); e != nil || onClosed.Note != "Groceries" {
		t.Fatalf("note fix on archived wallet: %+v %v", onClosed, e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "usd-rate", dollars.ID, 1, finance.TransactionInput{Kind: "expense", WalletID: usd.ID, Amount: "1", Date: "2026-09-14", Rate: "121"}, false); e != nil {
		t.Fatalf("rate fix on archived USD wallet: %v", e)
	}
	for name, tc := range map[string]struct {
		id    string
		in    finance.TransactionInput
		field string
	}{
		"amount on archived":     {onClosed.ID, finance.TransactionInput{Kind: "expense", WalletID: closed.ID, Amount: "90", Date: "2026-09-13"}, "wallet_id"},
		"move off archived":      {onClosed.ID, finance.TransactionInput{Kind: "expense", WalletID: open.ID, Amount: "100", Date: "2026-09-13"}, "wallet_id"},
		"move onto archived":     {onOpen.ID, finance.TransactionInput{Kind: "expense", WalletID: closed.ID, Amount: "50", Date: "2026-09-14"}, "wallet_id"},
		"transfer into archived": {transfer.ID, finance.TransactionInput{Kind: "transfer", WalletID: open.ID, ToWalletID: closed.ID, Amount: "20", Date: "2026-09-14"}, "to_wallet_id"},
	} {
		version := 1
		if tc.id == onClosed.ID {
			version = 2
		}
		_, e = s.ReviseTransaction(ctx, u.ID, "reject-"+name, tc.id, version, tc.in, false)
		var fe *finance.Error
		if !errors.As(e, &fe) || fe.Code != finance.CodeArchivedWallet || fe.Field != tc.field {
			t.Errorf("%s: %v", name, e)
		}
	}
	if after := balances(t, s); fmt.Sprint(after) != fmt.Sprint(before) {
		t.Fatalf("archived balances moved: %v -> %v", before, after)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "void-closed", onClosed.ID, 2, finance.TransactionInput{Reason: "Duplicate"}, true); e != nil {
		t.Fatalf("void on archived wallet: %v", e)
	}
	if b := balances(t, s)[closed.ID]; b != "1010.00" {
		t.Fatalf("void balance %s", b)
	}
}

// Regression (C4, C16): opening payloads carry no version, so the stale check used to fire first
// and report a retryable 409. Reconciliation records are refused as not correctable at any version.
func TestOpeningAndAdjustmentRecordsAreNotCorrectable(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "cash", "BDT", "", "100")
	adjustment, e := s.AdjustWallet(ctx, u.ID, "adjust", w.ID, w.Version, "80", "Counted cash")
	if e != nil {
		t.Fatal(e)
	}
	list, e := s.Transactions(ctx, 10, 0)
	if e != nil {
		t.Fatal(e)
	}
	var opening finance.Transaction
	for _, r := range list {
		if r.Kind == "opening" {
			opening = r
		}
	}
	if opening.Version != 1 {
		t.Fatalf("opening version: %+v", opening)
	}
	for _, r := range []finance.Transaction{opening, adjustment} {
		for _, version := range []int{0, 1} {
			if _, e = s.ReviseTransaction(ctx, u.ID, fmt.Sprint("edit-", r.ID, version), r.ID, version, finance.TransactionInput{Kind: r.Kind, WalletID: w.ID, Amount: "1", Date: "2026-09-14"}, false); !errors.Is(e, finance.ErrNotCorrectable) {
				t.Errorf("correct %s v%d: %v", r.Kind, version, e)
			}
			if _, e = s.ReviseTransaction(ctx, u.ID, fmt.Sprint("void-", r.ID, version), r.ID, version, finance.TransactionInput{Reason: "Mistake"}, true); !errors.Is(e, finance.ErrNotCorrectable) {
				t.Errorf("void %s v%d: %v", r.Kind, version, e)
			}
		}
	}
	if b := balances(t, s)[w.ID]; b != "80.00" {
		t.Fatalf("balance %s", b)
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
	if _, e := s.CreateTransaction(ctx, u.ID, "no-rate", input); !errors.Is(e, finance.ErrRateRequired) {
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
	if _, e = s.AdjustWallet(ctx, u.ID, "stale-adjust", w.ID, w.Version, "90", "Stale count"); !errors.Is(e, finance.ErrStaleVersion) {
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
	if _, e = s.CreateTransaction(ctx, u.ID, "archived-expense", finance.TransactionInput{Kind: "expense", WalletID: w.ID, Amount: "1", Date: "2026-09-14"}); !errors.Is(e, finance.ErrArchivedWallet) {
		t.Fatalf("archived expense: %v", e)
	}
	events, e := s.Audit(ctx, 100, 0)
	if e != nil || len(events) != 2 {
		t.Fatalf("audit: %+v %v", events, e)
	}
}
