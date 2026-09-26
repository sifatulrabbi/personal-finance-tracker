package httpapi_test

import (
	"context"
	"strings"
	"testing"

	"simply-finance/internal/ledger"
)

// Formulas (ADR 0014) over the real API with signed-in members: stored in canonical form,
// returned on reads and in history, rejected at their field when they do not equal the amount.

func TestRecordFormulaIsStoredReturnedAndKeptInHistory(t *testing.T) {
	h := newHousehold(t)
	var cash ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "2000"}, "cash", &cash)

	var created ledger.Transaction
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "765.50", AmountFormula: "120+45.50+300*2", Date: "2026-09-14"}, "shop", &created)
	if created.AmountFormula != "120 + 45.50 + 300 * 2" || created.Amount != "765.50" {
		t.Fatalf("created: %+v", created)
	}
	var read ledger.Transaction
	h.spouse.ok("GET", "/transactions/"+created.ID, nil, "", &read)
	if read.AmountFormula != created.AmountFormula {
		t.Fatalf("read: %+v", read)
	}
	var page struct {
		Items []ledger.Transaction `json:"items"`
	}
	h.spouse.ok("GET", "/transactions?limit=5&kind=expense", nil, "", &page)
	if len(page.Items) != 1 || page.Items[0].AmountFormula != created.AmountFormula {
		t.Fatalf("list: %+v", page)
	}
	if w := h.me.wallet(cash.ID); w.Balance != "1234.50" {
		t.Fatalf("balance %s", w.Balance)
	}

	// A note-only correction that omits the formula keeps it; an amount change drops it.
	var kept, dropped, replaced ledger.Transaction
	h.spouse.ok("PUT", "/transactions/"+created.ID, map[string]any{"kind": "expense", "wallet_id": cash.ID, "amount": "765.50", "date": "2026-09-14", "note": "Groceries", "version": 1}, "note", &kept)
	if kept.AmountFormula != created.AmountFormula || kept.ActorEmail != "wife@example.test" {
		t.Fatalf("kept: %+v", kept)
	}
	h.me.ok("PUT", "/transactions/"+created.ID, map[string]any{"kind": "expense", "wallet_id": cash.ID, "amount": "700", "date": "2026-09-14", "note": "Groceries", "version": 2}, "amount", &dropped)
	if dropped.AmountFormula != "" {
		t.Fatalf("dropped: %+v", dropped)
	}
	h.me.ok("PUT", "/transactions/"+created.ID, map[string]any{"kind": "expense", "wallet_id": cash.ID, "amount": "700", "amount_formula": "350 × 2", "date": "2026-09-14", "note": "Groceries", "version": 3}, "replace", &replaced)
	if replaced.AmountFormula != "350 * 2" {
		t.Fatalf("replaced: %+v", replaced)
	}
	var history []ledger.Transaction
	h.me.ok("GET", "/transactions/"+created.ID+"/history", nil, "", &history)
	want := []string{"120 + 45.50 + 300 * 2", "120 + 45.50 + 300 * 2", "", "350 * 2"}
	if len(history) != len(want) {
		t.Fatalf("history: %+v", history)
	}
	for i, r := range history {
		if r.AmountFormula != want[i] {
			t.Fatalf("revision %d formula %q, want %q", r.Version, r.AmountFormula, want[i])
		}
	}
	// A void keeps the content of the revision it voids, formula included.
	var voided ledger.Transaction
	h.me.ok("POST", "/transactions/"+created.ID+"/void", map[string]any{"version": 4, "reason": "Duplicate"}, "void", &voided)
	if !voided.Voided || voided.AmountFormula != "350 * 2" {
		t.Fatalf("voided: %+v", voided)
	}
	if e := h.store.Store.VerifyDerivedState(context.Background()); e != nil {
		t.Fatal(e)
	}
}

func TestMismatchedOrInvalidFormulaIsRejectedWithoutEffect(t *testing.T) {
	h := newHousehold(t)
	var cash, usd ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "1000"}, "cash", &cash)
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Dollars", Type: "bank", Currency: "USD", OpeningBalance: "0"}, "usd", &usd)
	for key, body := range map[string]ledger.TransactionInput{
		"mismatch":  {Kind: "expense", WalletID: cash.ID, Amount: "765.51", AmountFormula: "120+45.50+300*2", Date: "2026-09-14"},
		"grammar":   {Kind: "expense", WalletID: cash.ID, Amount: "8", AmountFormula: "2^3", Date: "2026-09-14"},
		"function":  {Kind: "expense", WalletID: cash.ID, Amount: "2", AmountFormula: "sqrt(4)", Date: "2026-09-14"},
		"exponent":  {Kind: "expense", WalletID: cash.ID, Amount: "1000", AmountFormula: "1e3", Date: "2026-09-14"},
		"by zero":   {Kind: "expense", WalletID: cash.ID, Amount: "1", AmountFormula: "1/0", Date: "2026-09-14"},
		"received":  {Kind: "transfer", WalletID: cash.ID, ToWalletID: usd.ID, Amount: "1200", ReceivedAmount: "10", ReceivedAmountFormula: "5+4", Date: "2026-09-14"},
		"too long":  {Kind: "expense", WalletID: cash.ID, Amount: "2", AmountFormula: "1+1" + strings.Repeat(" ", 198), Date: "2026-09-14"},
		"no amount": {Kind: "income", WalletID: cash.ID, AmountFormula: "1+1", Date: "2026-09-14"},
	} {
		env := h.me.fails("POST", "/transactions", body, key, 400, "validation_failed")
		want := "amount_formula"
		switch key {
		case "received":
			want = "received_amount_formula"
		case "no amount":
			want = "amount"
		}
		if env.Error.Field != want {
			t.Errorf("%s: field %q, want %q (%s)", key, env.Error.Field, want, env.Error.Message)
		}
	}
	if w := h.me.wallet(cash.ID); w.Balance != "1000.00" {
		t.Fatalf("balance moved: %s", w.Balance)
	}
	// A cross-currency transfer's received formula that equals the received amount is kept.
	var moved ledger.Transaction
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "transfer", WalletID: cash.ID, ToWalletID: usd.ID, Amount: "1200", AmountFormula: "1000+200", ReceivedAmount: "9.50", ReceivedAmountFormula: "10-0.5", Date: "2026-09-14"}, "moved", &moved)
	if moved.AmountFormula != "1000 + 200" || moved.ReceivedAmountFormula != "10 - 0.5" {
		t.Fatalf("transfer: %+v", moved)
	}
}

func TestBillConfirmOpeningAndAdjustFormulas(t *testing.T) {
	h := newHousehold(t)
	var cash ledger.Wallet
	h.me.ok("POST", "/wallets", map[string]any{"name": "Cash", "type": "physical", "opening_balance": "1500", "opening_balance_formula": "1,000 + 500"}, "cash", &cash)
	h.me.fails("POST", "/wallets", map[string]any{"name": "Other", "type": "physical", "opening_balance": "1400", "opening_balance_formula": "1000+500"}, "other", 400, "validation_failed")
	var page struct {
		Items []ledger.Transaction `json:"items"`
	}
	h.me.ok("GET", "/transactions?limit=5&kind=opening&wallet_id="+cash.ID, nil, "", &page)
	if len(page.Items) != 1 || page.Items[0].AmountFormula != "1000 + 500" || page.Items[0].Amount != "1500.00" {
		t.Fatalf("opening: %+v", page)
	}

	h.me.ok("POST", "/schedules", ledger.ScheduleInput{Name: "Phone", WalletID: cash.ID, Amount: "500", Frequency: "monthly", StartDate: "2026-09-01"}, "phone", nil)
	var due []ledger.Bill
	h.me.ok("GET", "/bills/due", nil, "", &due)
	if len(due) != 1 {
		t.Fatalf("due: %+v", due)
	}
	env := h.me.fails("POST", "/bills/"+due[0].ID+"/confirm", map[string]any{"amount": "450", "amount_formula": "500-49"}, "pay-bad", 400, "validation_failed")
	if env.Error.Field != "amount_formula" {
		t.Fatalf("confirm mismatch field %q", env.Error.Field)
	}
	var paid ledger.Transaction
	h.me.ok("POST", "/bills/"+due[0].ID+"/confirm", map[string]any{"amount": "450", "amount_formula": "500−50"}, "pay", &paid)
	if paid.AmountFormula != "500 - 50" || paid.Amount != "450.00" {
		t.Fatalf("paid: %+v", paid)
	}

	w := h.me.wallet(cash.ID)
	env = h.me.fails("POST", "/wallets/"+cash.ID+"/adjust", map[string]any{"balance_version": w.BalanceVersion, "balance": "1000", "balance_formula": "999+2", "reason": "Counted"}, "adjust-bad", 400, "validation_failed")
	if env.Error.Field != "balance_formula" {
		t.Fatalf("adjust mismatch field %q", env.Error.Field)
	}
	var adjusted ledger.Transaction
	h.me.ok("POST", "/wallets/"+cash.ID+"/adjust", map[string]any{"balance_version": w.BalanceVersion, "balance": "1000", "balance_formula": "500*2", "reason": "Counted"}, "adjust", &adjusted)
	if adjusted.BalanceFormula != "500 * 2" || adjusted.AmountFormula != "" || adjusted.Amount != "-50.00" {
		t.Fatalf("adjusted: %+v", adjusted)
	}
	var history []ledger.Transaction
	h.spouse.ok("GET", "/transactions/"+adjusted.ID+"/history", nil, "", &history)
	if len(history) != 1 || history[0].BalanceFormula != "500 * 2" {
		t.Fatalf("adjust history: %+v", history)
	}
	// A retried adjustment with the same key replays; the formula is part of the request.
	h.me.ok("POST", "/wallets/"+cash.ID+"/adjust", map[string]any{"balance_version": w.BalanceVersion, "balance": "1000", "balance_formula": "500*2", "reason": "Counted"}, "adjust", nil)
	h.me.fails("POST", "/wallets/"+cash.ID+"/adjust", map[string]any{"balance_version": w.BalanceVersion, "balance": "1000", "balance_formula": "250*4", "reason": "Counted"}, "adjust", 409, "idempotency_key_reused")
	if got := h.me.wallet(cash.ID); got.Balance != "1000.00" {
		t.Fatalf("balance %s", got.Balance)
	}
	// balance_formula is not a field of a transaction input.
	h.me.fails("POST", "/transactions", map[string]any{"kind": "expense", "wallet_id": cash.ID, "amount": "1", "date": "2026-09-14", "balance_formula": "1"}, "unknown", 400, "validation_failed")
	if e := h.store.Store.VerifyDerivedState(context.Background()); e != nil {
		t.Fatal(e)
	}
}
