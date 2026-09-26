package httpapi_test

import (
	"simply-finance/internal/finance"
	"testing"
)

type debitSetup struct {
	h                  *household
	bank, card, credit finance.Wallet
}

func newDebitSetup(t *testing.T) debitSetup {
	t.Helper()
	h := newHousehold(t)
	d := debitSetup{h: h}
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "Bank", Type: "bank", OpeningBalance: "50000"}, "bank", &d.bank)
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "Debit", Type: "card", CardType: "debit", BankWalletID: d.bank.ID}, "debit", &d.card)
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "Credit", Type: "card", CardType: "credit", CreditLimit: "20000", OpeningBalance: "3000"}, "credit", &d.credit)
	return d
}

func (d debitSetup) balances(t *testing.T, bank, card string) {
	t.Helper()
	if b := d.h.me.wallet(d.bank.ID); b.Balance != bank {
		t.Errorf("bank balance %s, want %s", b.Balance, bank)
	}
	if c := d.h.me.wallet(d.card.ID); c.Balance != card || c.BankWalletID != d.bank.ID {
		t.Errorf("card %+v, want balance %s linked to the bank", c, card)
	}
}

// Regression (C6): a debit card could hold its own opening balance and activity, so a bank
// account and its card counted the same money twice. A debit card is now a view onto its bank
// wallet: it has no balance, and records made with it move the bank wallet's balance while the
// record keeps which card was used.
func TestDebitCardSpendingMovesItsBankWallet(t *testing.T) {
	d := newDebitSetup(t)
	h := d.h
	if d.card.Balance != "0.00" || d.card.BankWalletID != d.bank.ID || d.card.Currency != "BDT" {
		t.Fatalf("card: %+v", d.card)
	}
	var expense finance.Transaction
	h.me.ok("POST", "/transactions", finance.TransactionInput{Kind: "expense", WalletID: d.card.ID, Amount: "1000", Date: "2026-09-14"}, "shop", &expense)
	if expense.WalletID != d.card.ID {
		t.Fatalf("record lost the card: %+v", expense)
	}
	d.balances(t, "49000.00", "0.00")
	h.me.ok("POST", "/transactions", finance.TransactionInput{Kind: "transfer", WalletID: d.card.ID, ToWalletID: d.credit.ID, Amount: "2000", Date: "2026-09-14"}, "repay", nil)
	d.balances(t, "47000.00", "0.00")
	if c := h.me.wallet(d.credit.ID); c.Debt != "1000.00" {
		t.Fatalf("credit: %+v", c)
	}
	h.me.ok("PUT", "/transactions/"+expense.ID, map[string]any{"version": 1, "kind": "expense", "wallet_id": d.card.ID, "amount": "1200", "date": "2026-09-14"}, "fix", &expense)
	d.balances(t, "46800.00", "0.00")
	h.me.ok("POST", "/transactions/"+expense.ID+"/void", map[string]any{"version": 2, "reason": "Refunded"}, "void", nil)
	d.balances(t, "48000.00", "0.00")

	// A bill paid by the card is paid from the bank.
	var due []finance.Bill
	h.me.ok("POST", "/schedules", finance.ScheduleInput{Name: "Phone", WalletID: d.card.ID, Amount: "500", Frequency: "monthly", StartDate: "2026-09-01"}, "phone", nil)
	h.me.ok("GET", "/bills/due", nil, "", &due)
	h.me.ok("POST", "/bills/"+due[0].ID+"/confirm", finance.PaymentInput{Date: "2026-09-14"}, "pay-phone", nil)
	d.balances(t, "47500.00", "0.00")

	// Moving money between the card and its own bank is not a transfer.
	env := h.me.fails("POST", "/transactions", finance.TransactionInput{Kind: "transfer", WalletID: d.bank.ID, ToWalletID: d.card.ID, Amount: "1", Date: "2026-09-14"}, "self", 400, "validation_failed")
	if env.Error.Field != "to_wallet_id" {
		t.Fatalf("field %q", env.Error.Field)
	}
	// The card has no balance to adjust; the bank wallet is adjusted instead.
	h.me.fails("POST", "/wallets/"+d.card.ID+"/adjust", map[string]any{"balance_version": d.card.BalanceVersion, "balance": "10", "reason": "Count"}, "adjust-card", 400, "validation_failed")
	// Renaming works; relinking does not.
	card := h.me.wallet(d.card.ID)
	card.Name = "Visa debit"
	h.me.ok("PUT", "/wallets/"+card.ID, card, "rename-card", nil)
	card = h.me.wallet(d.card.ID)
	card.BankWalletID = d.credit.ID
	h.me.fails("PUT", "/wallets/"+card.ID, card, "relink", 400, "validation_failed")
}

func TestDebitCardCreationRules(t *testing.T) {
	d := newDebitSetup(t)
	h := d.h
	var cash, usdBank, closed finance.Wallet
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "Cash", Type: "physical"}, "cash", &cash)
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "USD bank", Type: "bank", Currency: "USD"}, "usd-bank", &usdBank)
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "Closed", Type: "bank"}, "closed", &closed)
	closed.Archived = true
	h.me.ok("PUT", "/wallets/"+closed.ID, closed, "archive-closed", nil)
	for _, tc := range []struct {
		name        string
		in          finance.WalletInput
		status      int
		code, field string
	}{
		{"no bank", finance.WalletInput{Name: "D", Type: "card", CardType: "debit"}, 400, "validation_failed", "bank_wallet_id"},
		{"missing bank", finance.WalletInput{Name: "D", Type: "card", CardType: "debit", BankWalletID: "missing"}, 404, "not_found", "bank_wallet_id"},
		{"not a bank", finance.WalletInput{Name: "D", Type: "card", CardType: "debit", BankWalletID: cash.ID}, 400, "validation_failed", "bank_wallet_id"},
		{"archived bank", finance.WalletInput{Name: "D", Type: "card", CardType: "debit", BankWalletID: closed.ID}, 400, "archived_wallet", "bank_wallet_id"},
		{"own balance", finance.WalletInput{Name: "D", Type: "card", CardType: "debit", BankWalletID: d.bank.ID, OpeningBalance: "100"}, 400, "validation_failed", "opening_balance"},
		{"other currency", finance.WalletInput{Name: "D", Type: "card", CardType: "debit", BankWalletID: d.bank.ID, Currency: "USD"}, 400, "validation_failed", "currency"},
		{"link on a bank", finance.WalletInput{Name: "D", Type: "bank", BankWalletID: d.bank.ID}, 400, "validation_failed", "bank_wallet_id"},
		{"link on a credit card", finance.WalletInput{Name: "D", Type: "card", CardType: "credit", BankWalletID: d.bank.ID}, 400, "validation_failed", "bank_wallet_id"},
	} {
		env := h.me.fails("POST", "/wallets", tc.in, "bad-"+tc.name, tc.status, tc.code)
		if env.Error.Field != tc.field {
			t.Errorf("%s: field %q, want %q", tc.name, env.Error.Field, tc.field)
		}
	}
	// Currency follows the bank when omitted, and an explicit zero opening balance is fine.
	var usdCard finance.Wallet
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "USD debit", Type: "card", CardType: "debit", BankWalletID: usdBank.ID, OpeningBalance: "0"}, "usd-card", &usdCard)
	if usdCard.Currency != "USD" {
		t.Fatalf("currency: %+v", usdCard)
	}
	// A debit card adds no opening record of its own.
	var records []finance.Transaction
	h.me.ok("GET", "/transactions", nil, "", &records)
	for _, r := range records {
		if r.WalletID == usdCard.ID || r.WalletID == d.card.ID {
			t.Fatalf("debit card has its own record: %+v", r)
		}
	}
}

// Archiving follows both sides: an archived card cannot be used for new records, and a card whose
// bank is archived cannot move the archived bank's balance. Corrections that keep the balance
// the same are still allowed on an archived card.
func TestArchivedDebitCardsAndBanks(t *testing.T) {
	d := newDebitSetup(t)
	h := d.h
	var expense finance.Transaction
	h.me.ok("POST", "/transactions", finance.TransactionInput{Kind: "expense", WalletID: d.card.ID, Amount: "100", Date: "2026-09-14", Note: "Lunhc"}, "lunch", &expense)
	card := h.me.wallet(d.card.ID)
	card.Archived = true
	h.me.ok("PUT", "/wallets/"+card.ID, card, "archive-card", nil)
	h.me.fails("POST", "/transactions", finance.TransactionInput{Kind: "expense", WalletID: d.card.ID, Amount: "1", Date: "2026-09-14"}, "on-archived-card", 400, "archived_wallet")
	h.me.ok("PUT", "/transactions/"+expense.ID, map[string]any{"version": 1, "kind": "expense", "wallet_id": d.card.ID, "amount": "100", "date": "2026-09-14", "note": "Lunch"}, "fix-note", nil)
	h.me.fails("POST", "/transactions", finance.TransactionInput{Kind: "transfer", WalletID: d.credit.ID, ToWalletID: d.card.ID, Amount: "1", Date: "2026-09-14"}, "into-archived-card", 400, "archived_wallet")

	var other finance.Wallet
	h.me.ok("POST", "/wallets", finance.WalletInput{Name: "Other debit", Type: "card", CardType: "debit", BankWalletID: d.bank.ID}, "other", &other)
	bank := h.me.wallet(d.bank.ID)
	bank.Archived = true
	h.me.ok("PUT", "/wallets/"+bank.ID, bank, "archive-bank", nil)
	h.me.fails("POST", "/transactions", finance.TransactionInput{Kind: "expense", WalletID: other.ID, Amount: "1", Date: "2026-09-14"}, "via-archived-bank", 400, "archived_wallet")
}
