package ledger_test

import (
	"strings"
	"testing"

	"simply-finance/internal/ledger"
)

func TestPrepareRecordKeepsAFormulaThatEqualsTheAmount(t *testing.T) {
	f := ledger.RecordFacts{CategoryFound: true, From: ptr(cashBDT)}
	in := ledger.TransactionInput{Kind: "expense", WalletID: "cash", Amount: "765.50", AmountFormula: "=120+45.50+300×2", Date: "2026-09-14"}
	r, _, e := ledger.PrepareRecord(in, f)
	if e != nil || r.AmountFormula != "120 + 45.50 + 300 * 2" {
		t.Fatalf("%q %v", r.AmountFormula, e)
	}
	// Rounding is part of equality: 100/3 is 33.33, never 33.34.
	in.Amount, in.AmountFormula = "33.33", "100/3"
	if r, _, e = ledger.PrepareRecord(in, f); e != nil || r.AmountFormula != "100 / 3" {
		t.Fatalf("%q %v", r.AmountFormula, e)
	}
	in.Amount = "33.34"
	if _, _, e = ledger.PrepareRecord(in, f); !isField(e, "amount_formula") {
		t.Fatalf("mismatch: %v", e)
	}
}

func isField(e error, field string) bool {
	code, got := fieldOf(e)
	return code == "validation_failed" && got == field
}

func TestPrepareRecordRejectsBadFormulasAtTheirField(t *testing.T) {
	f := ledger.RecordFacts{CategoryFound: true, From: ptr(cashBDT), To: ptr(bankUSD), DefaultRate: "120"}
	for name, in := range map[string]ledger.TransactionInput{
		"grammar":                {Kind: "expense", WalletID: "cash", Amount: "8", AmountFormula: "2^3", Date: "2026-09-14"},
		"too long":               {Kind: "expense", WalletID: "cash", Amount: "2", AmountFormula: "1+1" + strings.Repeat(" ", 198), Date: "2026-09-14"},
		"division by zero":       {Kind: "expense", WalletID: "cash", Amount: "1", AmountFormula: "1/0", Date: "2026-09-14"},
		"received on an expense": {Kind: "expense", WalletID: "cash", Amount: "1", ReceivedAmountFormula: "1+0", Date: "2026-09-14"},
	} {
		want := "amount_formula"
		if in.ReceivedAmountFormula != "" {
			want = "received_amount_formula"
		}
		if _, _, e := ledger.PrepareRecord(in, f); !isField(e, want) {
			t.Errorf("%s: %v", name, e)
		}
	}
	// A cross-currency transfer's received formula is checked against the received amount, entered
	// or derived from the rate.
	transfer := ledger.TransactionInput{Kind: "transfer", WalletID: "cash", ToWalletID: "usd", Amount: "1200", ReceivedAmountFormula: "5+5", Date: "2026-09-14"}
	r, _, e := ledger.PrepareRecord(transfer, f)
	if e != nil || r.ReceivedAmount != "10.00" || r.ReceivedAmountFormula != "5 + 5" {
		t.Fatalf("derived: %+v %v", r, e)
	}
	transfer.ReceivedAmount = "9.99"
	if _, _, e = ledger.PrepareRecord(transfer, f); !isField(e, "received_amount_formula") {
		t.Fatalf("received mismatch: %v", e)
	}
}

// A correction that omits a formula keeps the prior one only while it still equals the amount.
func TestCorrectionKeepsOrDropsThePriorFormula(t *testing.T) {
	prior := ledger.Transaction{TransactionInput: ledger.TransactionInput{Kind: "expense", WalletID: "cash", Amount: "15.00", AmountFormula: "10 + 5"}}
	f := ledger.RecordFacts{CategoryFound: true, From: ptr(cashBDT), Prior: &prior}
	note := ledger.TransactionInput{Kind: "expense", WalletID: "cash", Amount: "15", Date: "2026-09-14", Note: "fixed note"}
	if r, _, e := ledger.PrepareRecord(note, f); e != nil || r.AmountFormula != "10 + 5" {
		t.Fatalf("kept: %q %v", r.AmountFormula, e)
	}
	changed := note
	changed.Amount = "16"
	if r, _, e := ledger.PrepareRecord(changed, f); e != nil || r.AmountFormula != "" {
		t.Fatalf("dropped: %q %v", r.AmountFormula, e)
	}
	replaced := changed
	replaced.AmountFormula = "8*2"
	if r, _, e := ledger.PrepareRecord(replaced, f); e != nil || r.AmountFormula != "8 * 2" {
		t.Fatalf("replaced: %q %v", r.AmountFormula, e)
	}
	// A new record never inherits anything.
	f.Prior = nil
	if r, _, e := ledger.PrepareRecord(note, f); e != nil || r.AmountFormula != "" {
		t.Fatalf("new: %q %v", r.AmountFormula, e)
	}
}

func TestBillPaymentCarriesItsFormula(t *testing.T) {
	b := ledger.Bill{Status: "due", WalletID: "cash", Amount: "500.00", Name: "Phone", DueDate: "2026-09-01"}
	in, e := ledger.BillPayment(b, ledger.PaymentInput{Amount: "450", AmountFormula: "500-50"}, ledger.PaymentFacts{})
	if e != nil || in.AmountFormula != "500-50" {
		t.Fatalf("%+v %v", in, e)
	}
}

func TestNewWalletOpeningFormula(t *testing.T) {
	nw, e := ledger.ValidateNewWallet(ledger.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "1500", OpeningBalanceFormula: "1,000 + 500"}, nil)
	if e != nil || nw.OpeningFormula != "1000 + 500" {
		t.Fatalf("%+v %v", nw, e)
	}
	if p := ledger.OpeningPayload("w", 150000, "2026-09-14", nw.OpeningFormula); p["amount_formula"] != "1000 + 500" {
		t.Fatalf("payload %v", p)
	}
	if _, e = ledger.ValidateNewWallet(ledger.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "1400", OpeningBalanceFormula: "1000+500"}, nil); !isField(e, "opening_balance_formula") {
		t.Fatalf("mismatch: %v", e)
	}
	bank := ledger.Wallet{ID: "bank", Type: "bank", Currency: "BDT"}
	if _, e = ledger.ValidateNewWallet(ledger.WalletInput{Name: "Debit", Type: "card", CardType: "debit", BankWalletID: "bank", OpeningBalanceFormula: "0+0"}, &bank); !isField(e, "opening_balance") {
		t.Fatalf("debit: %v", e)
	}
}

func TestAdjustmentFormulaEqualsTheTypedTarget(t *testing.T) {
	card := credit
	card.BalanceMinor = -10000
	// For a credit card the target is the debt owed; the formula equals the target as typed.
	r, _, e := ledger.Adjustment(card, 0, "150", "100+50", "statement", "2026-09-14")
	if e != nil || r.BalanceFormula != "100 + 50" || r.AmountFormula != "" || r.Amount != "-50.00" {
		t.Fatalf("%+v %v", r, e)
	}
	if _, _, e = ledger.Adjustment(card, 0, "150", "100+49", "statement", "2026-09-14"); !isField(e, "balance_formula") {
		t.Fatalf("mismatch: %v", e)
	}
}
