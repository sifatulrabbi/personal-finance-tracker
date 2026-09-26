package ledger_test

import (
	"errors"
	"testing"

	"simply-finance/internal/ledger"
)

func TestValidateNewWallet(t *testing.T) {
	bank := ptr(bankBDT)
	for name, tc := range map[string]struct {
		in          ledger.WalletInput
		bank        *ledger.Wallet
		code, field string
	}{
		"cash":                     {ledger.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "10"}, nil, "", ""},
		"blank name":               {ledger.WalletInput{Name: " ", Type: "physical"}, nil, "validation_failed", "name"},
		"long details":             {ledger.WalletInput{Name: "x", Type: "physical", Details: string(make([]byte, 2001))}, nil, "validation_failed", "details"},
		"bank link on credit":      {ledger.WalletInput{Name: "x", Type: "card", CardType: "credit", BankWalletID: "bank"}, bank, "validation_failed", "bank_wallet_id"},
		"debit without bank":       {ledger.WalletInput{Name: "x", Type: "card", CardType: "debit"}, nil, "validation_failed", "bank_wallet_id"},
		"debit on missing bank":    {ledger.WalletInput{Name: "x", Type: "card", CardType: "debit", BankWalletID: "gone"}, nil, "not_found", "bank_wallet_id"},
		"debit on a non-bank":      {ledger.WalletInput{Name: "x", Type: "card", CardType: "debit", BankWalletID: "cash"}, ptr(cashBDT), "validation_failed", "bank_wallet_id"},
		"debit on archived bank":   {ledger.WalletInput{Name: "x", Type: "card", CardType: "debit", BankWalletID: "closed"}, ptr(archived), "archived_wallet", "bank_wallet_id"},
		"debit currency differs":   {ledger.WalletInput{Name: "x", Type: "card", CardType: "debit", BankWalletID: "bank", Currency: "USD"}, bank, "validation_failed", "currency"},
		"debit with opening":       {ledger.WalletInput{Name: "x", Type: "card", CardType: "debit", BankWalletID: "bank", OpeningBalance: "1"}, bank, "validation_failed", "opening_balance"},
		"unknown currency":         {ledger.WalletInput{Name: "x", Type: "physical", Currency: "EUR"}, nil, "validation_failed", "currency"},
		"unknown type":             {ledger.WalletInput{Name: "x", Type: "vault"}, nil, "validation_failed", "type"},
		"card without card type":   {ledger.WalletInput{Name: "x", Type: "card"}, nil, "validation_failed", "card_type"},
		"card type on a bank":      {ledger.WalletInput{Name: "x", Type: "bank", CardType: "credit"}, nil, "validation_failed", "card_type"},
		"bad opening":              {ledger.WalletInput{Name: "x", Type: "bank", OpeningBalance: "1.234"}, nil, "validation_failed", "opening_balance"},
		"negative limit":           {ledger.WalletInput{Name: "x", Type: "card", CardType: "credit", CreditLimit: "-1"}, nil, "validation_failed", "credit_limit"},
		"limit on a bank":          {ledger.WalletInput{Name: "x", Type: "bank", CreditLimit: "10"}, nil, "validation_failed", "credit_limit"},
		"negative opening allowed": {ledger.WalletInput{Name: "x", Type: "bank", OpeningBalance: "-5"}, nil, "", ""},
	} {
		_, e := ledger.ValidateNewWallet(tc.in, tc.bank)
		if code, field := fieldOf(e); code != tc.code || field != tc.field {
			t.Errorf("%s: %s/%s %v", name, code, field, e)
		}
	}
	card, e := ledger.ValidateNewWallet(ledger.WalletInput{Name: "Card", Type: "card", CardType: "debit", BankWalletID: "bank"}, bank)
	if e != nil || card.Input.Currency != "BDT" || card.HasOpening {
		t.Fatalf("debit takes the bank's currency and has no opening: %+v %v", card, e)
	}
	cc, e := ledger.ValidateNewWallet(ledger.WalletInput{Name: "Visa", Type: "card", CardType: "credit", OpeningBalance: "300", CreditLimit: "1000"}, nil)
	if e != nil || cc.OpeningEffect != -30000 || cc.OpeningAmount != 30000 || cc.CreditLimit != 100000 || cc.Input.Currency != "BDT" {
		t.Fatalf("a credit opening balance is debt: %+v %v", cc, e)
	}
	p := ledger.OpeningPayload("w", -500, "2026-09-14", "")
	if p["kind"] != "opening" || p["amount"] != "-5.00" || p["wallet_id"] != "w" || p["date"] != "2026-09-14" || len(p) != 4 {
		t.Fatalf("opening payload: %+v", p)
	}
}

func TestSetAmountsKeepsCardDebtOutOfCash(t *testing.T) {
	c := credit
	c.SetAmounts(100000, -30000)
	if c.Balance != "0.00" || c.Debt != "300.00" || c.AvailableCredit != "700.00" || c.CreditLimit != "1000.00" || c.BalanceMinor != -30000 {
		t.Fatalf("credit: %+v", c)
	}
	b := bankBDT
	b.SetAmounts(0, 1234)
	if b.Balance != "12.34" || b.Debt != "" || b.AvailableCredit != "" {
		t.Fatalf("bank: %+v", b)
	}
}

func TestValidateWalletUpdate(t *testing.T) {
	old := ledger.Wallet{ID: "v", Name: "Visa", Type: "card", CardType: "credit", Currency: "BDT", Version: 3}
	edit := old
	edit.Name, edit.CreditLimit = "Visa Gold", "500"
	if limit, e := ledger.ValidateWalletUpdate(old, edit); e != nil || limit != 50000 {
		t.Fatalf("edit: %d %v", limit, e)
	}
	for name, tc := range map[string]struct {
		change      func(*ledger.Wallet)
		code, field string
	}{
		"stale":            {func(w *ledger.Wallet) { w.Version = 2 }, "stale_version", "version"},
		"blank name":       {func(w *ledger.Wallet) { w.Name = "" }, "validation_failed", "name"},
		"type":             {func(w *ledger.Wallet) { w.Type = "bank" }, "validation_failed", "type"},
		"card type":        {func(w *ledger.Wallet) { w.CardType = "debit" }, "validation_failed", "card_type"},
		"currency":         {func(w *ledger.Wallet) { w.Currency = "USD" }, "validation_failed", "currency"},
		"bank link":        {func(w *ledger.Wallet) { w.BankWalletID = "bank" }, "validation_failed", "bank_wallet_id"},
		"empty limit":      {func(w *ledger.Wallet) { w.CreditLimit = "" }, "validation_failed", "credit_limit"},
		"negative limit":   {func(w *ledger.Wallet) { w.CreditLimit = "-1" }, "validation_failed", "credit_limit"},
		"stale before bad": {func(w *ledger.Wallet) { w.Version, w.Name = 1, "" }, "stale_version", "version"},
	} {
		in := edit
		tc.change(&in)
		_, e := ledger.ValidateWalletUpdate(old, in)
		if code, field := fieldOf(e); code != tc.code || field != tc.field {
			t.Errorf("%s: %s/%s", name, code, field)
		}
	}
	cash := cashBDT
	cash.CreditLimit = "5"
	if _, e := ledger.ValidateWalletUpdate(cashBDT, cash); !errors.Is(e, ledger.ErrInvalid) {
		t.Fatalf("limit on cash: %v", e)
	}
}

func TestAdjustmentRecordsTheDifference(t *testing.T) {
	bank := bankBDT
	bank.BalanceMinor, bank.BalanceVersion = 10000, 4
	r, effects, e := ledger.Adjustment(bank, 4, "75.50", "", "counted", "2026-09-14")
	if e != nil || r.Kind != "adjustment" || r.Amount != "-24.50" || r.Note != "Balance set to 75.50" || r.Date != "2026-09-14" || r.Reason != "counted" || r.Version != 1 {
		t.Fatalf("adjustment: %+v %v", r, e)
	}
	if len(effects) != 1 || effects[0] != (ledger.Effect{WalletID: "bank", Delta: -2450, Field: "wallet_id"}) {
		t.Fatalf("effects: %+v", effects)
	}
	card := credit
	card.BalanceMinor = -10000
	r, effects, e = ledger.Adjustment(card, 0, "150", "", "statement", "2026-09-14")
	if e != nil || r.Amount != "-50.00" || effects[0].Delta != -5000 || r.Note != "Balance set to 150.00" {
		t.Fatalf("a credit target is the debt owed: %+v %+v %v", r, effects, e)
	}
	drained := legacy
	drained.BalanceMinor = 700
	if _, effects, e = ledger.Adjustment(drained, 0, "0", "", "drain", "2026-09-14"); e != nil || effects[0].Delta != -700 || effects[0].WalletID != "legacy" {
		t.Fatalf("legacy card to zero: %+v %v", effects, e)
	}
	for name, tc := range map[string]struct {
		w              ledger.Wallet
		version        int
		target, reason string
		code, field    string
	}{
		"stale":              {bank, 3, "1", "x", "stale_version", "version"},
		"archived":           {archived, 0, "1", "x", "archived_wallet", ""},
		"linked debit":       {debit, 0, "1", "x", "validation_failed", ""},
		"no reason":          {bank, 4, "1", " ", "validation_failed", "reason"},
		"bad target":         {bank, 4, "1.001", "x", "validation_failed", "balance"},
		"legacy to nonzero":  {drained, 0, "1", "x", "validation_failed", "balance"},
		"already that":       {bank, 4, "100", "x", "validation_failed", "balance"},
		"difference too big": {ledger.Wallet{ID: "w", Currency: "BDT", BalanceMinor: -9_000_000_000_000}, 0, "90000000000", "x", "validation_failed", "balance"},
	} {
		_, _, e := ledger.Adjustment(tc.w, tc.version, tc.target, "", tc.reason, "2026-09-14")
		if code, field := fieldOf(e); code != tc.code || field != tc.field {
			t.Errorf("%s: %s/%s %v", name, code, field, e)
		}
	}
}
