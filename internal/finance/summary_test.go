package finance_test

import (
	"simply-finance/internal/finance"
	"testing"
)

// Regression: the summary formatted its big-integer totals as if they were never negative, so an
// overdrawn cash total or an overpaid credit card (negative debt) panicked the request.
func TestSummaryFormatsNegativeTotals(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	cash := createWallet(t, s, u, "cash", "BDT", "", "0.20")
	card := createWallet(t, s, u, "card", "USD", "credit", "0")
	if _, e := s.CreateTransaction(ctx, u.ID, "overdraw", finance.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "1234.54", Date: "2026-09-14"}); e != nil {
		t.Fatal(e)
	}
	if _, e := s.CreateTransaction(ctx, u.ID, "refund", finance.TransactionInput{Kind: "income", WalletID: card.ID, Amount: "0.05", Rate: "120", Date: "2026-09-14"}); e != nil {
		t.Fatal(e)
	}
	sum, e := s.Summary(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if sum.Totals[0].Cash != "-1234.34" || sum.Totals[1].CardDebt != "-0.05" || sum.Totals[1].AvailableCredit != "0.05" {
		t.Fatalf("totals: %+v", sum.Totals)
	}
}
