package ledger_test

import (
	"errors"
	"reflect"
	"testing"

	"simply-finance/internal/ledger"
	"simply-finance/internal/money"
)

var (
	cashBDT   = ledger.Wallet{ID: "cash", Type: "physical", Currency: "BDT"}
	bankBDT   = ledger.Wallet{ID: "bank", Type: "bank", Currency: "BDT"}
	savingBDT = ledger.Wallet{ID: "saving", Type: "bank", Currency: "BDT"}
	bankUSD   = ledger.Wallet{ID: "usd", Type: "bank", Currency: "USD"}
	otherUSD  = ledger.Wallet{ID: "usd2", Type: "digital", Currency: "USD"}
	debit     = ledger.Wallet{ID: "debit", Type: "card", CardType: "debit", Currency: "BDT", BankWalletID: "bank"}
	debit2    = ledger.Wallet{ID: "debit2", Type: "card", CardType: "debit", Currency: "BDT", BankWalletID: "bank"}
	legacy    = ledger.Wallet{ID: "legacy", Type: "card", CardType: "debit", Currency: "BDT"}
	credit    = ledger.Wallet{ID: "credit", Type: "card", CardType: "credit", Currency: "BDT"}
	archived  = ledger.Wallet{ID: "closed", Type: "bank", Currency: "BDT", Archived: true}
)

func ptr(w ledger.Wallet) *ledger.Wallet { return &w }

func fieldOf(e error) (string, string) {
	var fe *ledger.Error
	if errors.As(e, &fe) {
		return fe.Code, fe.Field
	}
	return "", ""
}

func TestPrepareRecordRejectsInvalidInputInAFixedOrder(t *testing.T) {
	ok := ledger.RecordFacts{CategoryFound: true, From: ptr(cashBDT)}
	base := ledger.TransactionInput{Kind: "expense", WalletID: "cash", Amount: "10", Date: "2026-09-14"}
	for name, tc := range map[string]struct {
		change      func(*ledger.TransactionInput, *ledger.RecordFacts)
		code, field string
	}{
		"kind":                       {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Kind = "opening" }, "validation_failed", "kind"},
		"category on a transfer":     {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Kind, in.CategoryID = "transfer", "x" }, "validation_failed", "category_id"},
		"missing category":           {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { f.CategoryFound = false }, "validation_failed", "category_id"},
		"category before date":       {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { f.CategoryFound, in.Date = false, "bad" }, "validation_failed", "category_id"},
		"date":                       {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Date = "2026-02-30" }, "validation_failed", "date"},
		"note":                       {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Note = string(make([]byte, 2001)) }, "validation_failed", "note"},
		"reason":                     {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Reason = string(make([]byte, 501)) }, "validation_failed", "reason"},
		"missing wallet":             {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { f.From = nil }, "not_found", "wallet_id"},
		"wallet before amount":       {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { f.From, in.Amount = nil, "x" }, "not_found", "wallet_id"},
		"zero amount":                {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Amount = "0" }, "validation_failed", "amount"},
		"three decimals":             {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Amount = "1.001" }, "validation_failed", "amount"},
		"destination on an expense":  {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.ToWalletID = "bank" }, "validation_failed", "to_wallet_id"},
		"received on an expense":     {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.ReceivedAmount = "10" }, "validation_failed", "received_amount"},
		"bad explicit rate":          {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Rate = "0" }, "validation_failed", "rate"},
		"transfer to itself":         {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Kind, in.ToWalletID = "transfer", "cash" }, "validation_failed", "to_wallet_id"},
		"transfer to missing wallet": {func(in *ledger.TransactionInput, f *ledger.RecordFacts) { in.Kind, in.ToWalletID = "transfer", "gone" }, "not_found", "to_wallet_id"},
		"card to its own bank": {func(in *ledger.TransactionInput, f *ledger.RecordFacts) {
			in.Kind, in.WalletID, in.ToWalletID, f.From, f.To = "transfer", "debit", "bank", ptr(debit), ptr(bankBDT)
		}, "validation_failed", "to_wallet_id"},
		"two cards on one bank": {func(in *ledger.TransactionInput, f *ledger.RecordFacts) {
			in.Kind, in.WalletID, in.ToWalletID, f.From, f.To = "transfer", "debit", "debit2", ptr(debit), ptr(debit2)
		}, "validation_failed", "to_wallet_id"},
		"same currency received differs": {func(in *ledger.TransactionInput, f *ledger.RecordFacts) {
			in.Kind, in.ToWalletID, in.ReceivedAmount, f.To = "transfer", "bank", "9", ptr(bankBDT)
		}, "validation_failed", "received_amount"},
		"bad received amount": {func(in *ledger.TransactionInput, f *ledger.RecordFacts) {
			in.Kind, in.ToWalletID, in.ReceivedAmount, f.To = "transfer", "usd", "-1", ptr(bankUSD)
		}, "validation_failed", "received_amount"},
		"conversion too large": {func(in *ledger.TransactionInput, f *ledger.RecordFacts) {
			in.WalletID, in.Amount, in.Rate, f.From = "usd", money.FormatMoney(money.MaxMoney), "1000", ptr(bankUSD)
		}, "validation_failed", "amount"},
	} {
		in, f := base, ok
		tc.change(&in, &f)
		_, effects, e := ledger.PrepareRecord(in, f)
		if code, field := fieldOf(e); code != tc.code || field != tc.field || effects != nil {
			t.Errorf("%s: got %s/%s %v", name, code, field, e)
		}
	}
}

func TestPrepareRecordNeedsARateOnlyWhenAValueIsConverted(t *testing.T) {
	for name, tc := range map[string]struct {
		in          ledger.TransactionInput
		from, to    ledger.Wallet
		defaultRate string
		rate, bdt   string
		received    string
		err         error
	}{
		"BDT expense":                   {in: ledger.TransactionInput{Kind: "expense", Amount: "10"}, from: cashBDT, bdt: "10.00"},
		"BDT expense ignores default":   {in: ledger.TransactionInput{Kind: "expense", Amount: "10"}, from: cashBDT, defaultRate: "120", bdt: "10.00"},
		"USD expense without a rate":    {in: ledger.TransactionInput{Kind: "expense", Amount: "1"}, from: bankUSD, err: ledger.ErrRateRequired},
		"USD income without a rate":     {in: ledger.TransactionInput{Kind: "income", Amount: "1"}, from: bankUSD, err: ledger.ErrRateRequired},
		"USD expense at the default":    {in: ledger.TransactionInput{Kind: "expense", Amount: "2"}, from: bankUSD, defaultRate: "120.5", rate: "120.500000", bdt: "241.00"},
		"explicit rate beats default":   {in: ledger.TransactionInput{Kind: "expense", Amount: "2", Rate: "100"}, from: bankUSD, defaultRate: "120", rate: "100.000000", bdt: "200.00"},
		"USD to USD needs none":         {in: ledger.TransactionInput{Kind: "transfer", Amount: "10"}, from: bankUSD, to: otherUSD, received: "10.00"},
		"USD to USD snapshots default":  {in: ledger.TransactionInput{Kind: "transfer", Amount: "5"}, from: bankUSD, to: otherUSD, defaultRate: "120", rate: "120.000000", bdt: "600.00", received: "5.00"},
		"cross currency, both amounts":  {in: ledger.TransactionInput{Kind: "transfer", Amount: "10", ReceivedAmount: "1230"}, from: bankUSD, to: bankBDT, bdt: "1230.00", received: "1230.00"},
		"cross currency, derived":       {in: ledger.TransactionInput{Kind: "transfer", Amount: "10", Rate: "123"}, from: bankUSD, to: bankBDT, rate: "123.000000", bdt: "1230.00", received: "1230.00"},
		"cross currency, no rate":       {in: ledger.TransactionInput{Kind: "transfer", Amount: "1"}, from: bankUSD, to: bankBDT, err: ledger.ErrRateRequired},
		"BDT to USD derived at rate":    {in: ledger.TransactionInput{Kind: "transfer", Amount: "1230", Rate: "123"}, from: bankBDT, to: bankUSD, rate: "123.000000", bdt: "1230.00", received: "10.00"},
		"BDT to USD, received entered":  {in: ledger.TransactionInput{Kind: "transfer", Amount: "1230", ReceivedAmount: "9.5"}, from: bankBDT, to: bankUSD, bdt: "1230.00", received: "9.50"},
		"derived amount rounds to zero": {in: ledger.TransactionInput{Kind: "transfer", Amount: "0.01", Rate: "1000"}, from: bankBDT, to: bankUSD, err: ledger.Invalid("received_amount", "")},
	} {
		tc.in.WalletID, tc.in.ToWalletID, tc.in.Date = tc.from.ID, tc.to.ID, "2026-09-14"
		f := ledger.RecordFacts{CategoryFound: true, From: ptr(tc.from), DefaultRate: tc.defaultRate}
		if tc.in.Kind == "transfer" {
			f.To = ptr(tc.to)
		}
		r, _, e := ledger.PrepareRecord(tc.in, f)
		if tc.err != nil {
			if !errors.Is(e, tc.err) {
				t.Errorf("%s: %v, want %v", name, e, tc.err)
			}
			continue
		}
		if e != nil || r.Rate != tc.rate || r.BDTAmount != tc.bdt || r.ReceivedAmount != tc.received {
			t.Errorf("%s: rate %q bdt %q received %q %v", name, r.Rate, r.BDTAmount, r.ReceivedAmount, e)
		}
	}
}

func TestPrepareRecordEffectsFollowTheLedgerWallet(t *testing.T) {
	for name, tc := range map[string]struct {
		in       ledger.TransactionInput
		from, to ledger.Wallet
		want     []ledger.Effect
	}{
		"income adds":             {ledger.TransactionInput{Kind: "income", Amount: "5"}, cashBDT, ledger.Wallet{}, []ledger.Effect{{WalletID: "cash", Delta: 500, Field: "wallet_id"}}},
		"expense subtracts":       {ledger.TransactionInput{Kind: "expense", Amount: "5"}, cashBDT, ledger.Wallet{}, []ledger.Effect{{WalletID: "cash", Delta: -500, Field: "wallet_id"}}},
		"credit purchase is debt": {ledger.TransactionInput{Kind: "expense", Amount: "5"}, credit, ledger.Wallet{}, []ledger.Effect{{WalletID: "credit", Delta: -500, Field: "wallet_id"}}},
		"debit card posts to bank": {ledger.TransactionInput{Kind: "expense", Amount: "5"}, debit, ledger.Wallet{},
			[]ledger.Effect{{WalletID: "bank", Delta: -500, Field: "wallet_id"}}},
		"legacy card posts to itself": {ledger.TransactionInput{Kind: "expense", Amount: "5"}, legacy, ledger.Wallet{},
			[]ledger.Effect{{WalletID: "legacy", Delta: -500, Field: "wallet_id"}}},
		"card repayment is a transfer": {ledger.TransactionInput{Kind: "transfer", Amount: "5"}, bankBDT, credit,
			[]ledger.Effect{{WalletID: "bank", Delta: -500, Field: "wallet_id"}, {WalletID: "credit", Delta: 500, Field: "to_wallet_id"}}},
		"transfer to a card lands on its bank": {ledger.TransactionInput{Kind: "transfer", Amount: "5"}, savingBDT, debit,
			[]ledger.Effect{{WalletID: "saving", Delta: -500, Field: "wallet_id"}, {WalletID: "bank", Delta: 500, Field: "to_wallet_id"}}},
	} {
		tc.in.WalletID, tc.in.ToWalletID, tc.in.Date = tc.from.ID, tc.to.ID, "2026-09-14"
		f := ledger.RecordFacts{CategoryFound: true, From: ptr(tc.from)}
		if tc.in.Kind == "transfer" {
			f.To = ptr(tc.to)
		}
		r, effects, e := ledger.PrepareRecord(tc.in, f)
		if e != nil || !reflect.DeepEqual(effects, tc.want) {
			t.Errorf("%s: %+v %v", name, effects, e)
		}
		if r.Amount != "5.00" {
			t.Errorf("%s: amount %q not canonical", name, r.Amount)
		}
	}
}

func TestPrepareRecordResolvesCategories(t *testing.T) {
	f := ledger.RecordFacts{CategoryFound: true, From: ptr(cashBDT)}
	for _, tc := range []struct {
		kind, category, want string
	}{{"expense", "", "others-expense"}, {"income", "", "others-income"}, {"expense", "food", "food"}} {
		r, _, e := ledger.PrepareRecord(ledger.TransactionInput{Kind: tc.kind, CategoryID: tc.category, WalletID: "cash", Amount: "1", Date: "2026-09-14"}, f)
		if e != nil || r.CategoryID != tc.want {
			t.Errorf("%+v: %q %v", tc, r.CategoryID, e)
		}
	}
	legacyExpense := ledger.Transaction{TransactionInput: ledger.TransactionInput{Kind: "expense"}}
	ledger.DefaultCategory(&legacyExpense)
	transfer := ledger.Transaction{TransactionInput: ledger.TransactionInput{Kind: "transfer"}}
	ledger.DefaultCategory(&transfer)
	if legacyExpense.CategoryID != "others-expense" || transfer.CategoryID != "" {
		t.Fatalf("legacy resolution: %q %q", legacyExpense.CategoryID, transfer.CategoryID)
	}
}

// FuzzTransferMovesExactlyWhatIsSent checks that a same-currency transfer never creates or destroys
// money: its two effects cancel, whatever the amount.
func FuzzTransferMovesExactlyWhatIsSent(f *testing.F) {
	for _, n := range []int64{1, 99, 100_00, money.MaxMoney} {
		f.Add(n)
	}
	f.Fuzz(func(t *testing.T, n int64) {
		if n <= 0 || n > money.MaxMoney {
			return
		}
		in := ledger.TransactionInput{Kind: "transfer", WalletID: "bank", ToWalletID: "saving", Amount: money.FormatMoney(n), Date: "2026-09-14"}
		_, effects, e := ledger.PrepareRecord(in, ledger.RecordFacts{From: ptr(bankBDT), To: ptr(savingBDT)})
		if e != nil || len(effects) != 2 || effects[0].Delta+effects[1].Delta != 0 || effects[1].Delta != n {
			t.Fatalf("%d: %+v %v", n, effects, e)
		}
	})
}

func TestCheckNamedWallets(t *testing.T) {
	transfer := ledger.TransactionInput{Kind: "transfer", WalletID: "legacy", ToWalletID: "bank"}
	for name, tc := range map[string]struct {
		in          ledger.TransactionInput
		old         *ledger.Transaction
		from, to    *ledger.Wallet
		code, field string
	}{
		"active wallets":              {ledger.TransactionInput{Kind: "expense", WalletID: "cash"}, nil, ptr(cashBDT), nil, "", ""},
		"new record on archived":      {ledger.TransactionInput{Kind: "expense", WalletID: "closed"}, nil, ptr(archived), nil, "archived_wallet", "wallet_id"},
		"transfer into archived":      {ledger.TransactionInput{Kind: "transfer", WalletID: "cash", ToWalletID: "closed"}, nil, ptr(cashBDT), ptr(archived), "archived_wallet", "to_wallet_id"},
		"correction keeps archived":   {ledger.TransactionInput{Kind: "expense", WalletID: "closed"}, &ledger.Transaction{TransactionInput: ledger.TransactionInput{WalletID: "closed"}}, ptr(archived), nil, "", ""},
		"correction moves onto it":    {ledger.TransactionInput{Kind: "expense", WalletID: "closed"}, &ledger.Transaction{TransactionInput: ledger.TransactionInput{WalletID: "cash"}}, ptr(archived), nil, "archived_wallet", "wallet_id"},
		"legacy card expense":         {ledger.TransactionInput{Kind: "expense", WalletID: "legacy"}, nil, ptr(legacy), nil, "validation_failed", "wallet_id"},
		"legacy card drained":         {transfer, nil, ptr(legacy), ptr(bankBDT), "", ""},
		"transfer into a legacy card": {ledger.TransactionInput{Kind: "transfer", WalletID: "bank", ToWalletID: "legacy"}, nil, ptr(bankBDT), ptr(legacy), "validation_failed", "to_wallet_id"},
		"legacy card kept on repair":  {ledger.TransactionInput{Kind: "expense", WalletID: "legacy"}, &ledger.Transaction{TransactionInput: ledger.TransactionInput{WalletID: "legacy"}}, ptr(legacy), nil, "", ""},
	} {
		code, field := fieldOf(ledger.CheckNamedWallets(tc.in, tc.old, tc.from, tc.to))
		if code != tc.code || field != tc.field {
			t.Errorf("%s: %s/%s", name, code, field)
		}
	}
}

func TestBalanceChangesListOnlyMovedWallets(t *testing.T) {
	e := func(w string, d int64, field string) ledger.Effect {
		return ledger.Effect{WalletID: w, Delta: d, Field: field}
	}
	for name, tc := range map[string]struct {
		before, after []ledger.Effect
		want          []ledger.BalanceChange
	}{
		"new record":           {nil, []ledger.Effect{e("b", -5, "wallet_id"), e("a", 5, "to_wallet_id")}, []ledger.BalanceChange{{WalletID: "a", Field: "to_wallet_id"}, {WalletID: "b", Field: "wallet_id"}}},
		"note-only correction": {[]ledger.Effect{e("a", -5, "wallet_id")}, []ledger.Effect{e("a", -5, "wallet_id")}, []ledger.BalanceChange{}},
		"amount correction":    {[]ledger.Effect{e("a", -5, "wallet_id")}, []ledger.Effect{e("a", -6, "wallet_id")}, []ledger.BalanceChange{{WalletID: "a", Field: "wallet_id"}}},
		"moved off a wallet":   {[]ledger.Effect{e("a", -5, "wallet_id")}, []ledger.Effect{e("b", -5, "wallet_id")}, []ledger.BalanceChange{{WalletID: "b", Field: "wallet_id"}}},
		"void":                 {[]ledger.Effect{e("a", -5, "wallet_id")}, nil, []ledger.BalanceChange{}},
		"default field":        {nil, []ledger.Effect{e("a", 5, "")}, []ledger.BalanceChange{{WalletID: "a", Field: "wallet_id"}}},
	} {
		if got := ledger.BalanceChanges(tc.before, tc.after); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: %+v", name, got)
		}
	}
}

func TestCheckBalanceBoundsBothSigns(t *testing.T) {
	for balance, ok := range map[int64]bool{0: true, money.MaxMoney: true, -money.MaxMoney: true, money.MaxMoney + 1: false, -money.MaxMoney - 1: false} {
		if (ledger.CheckBalance(balance) == nil) != ok {
			t.Errorf("%d", balance)
		}
	}
	if code, field := fieldOf(ledger.CheckBalance(money.MaxMoney + 1)); code != "validation_failed" || field != "amount" {
		t.Fatalf("%s/%s", code, field)
	}
}

func TestCorrectionAndVoidRules(t *testing.T) {
	expense := ledger.Transaction{TransactionInput: ledger.TransactionInput{Kind: "expense", Rate: "120.000000", CategoryID: "food", Note: "lunch"}, ID: "t", Version: 2}
	for name, tc := range map[string]struct {
		old     ledger.Transaction
		version int
		void    bool
		reason  string
		want    error
	}{
		"current correction":          {expense, 2, false, "", nil},
		"stale":                       {expense, 1, false, "", ledger.ErrStaleVersion},
		"opening before stale":        {ledger.Transaction{TransactionInput: ledger.TransactionInput{Kind: "opening"}, Version: 1}, 9, false, "", ledger.ErrNotCorrectable},
		"adjustment":                  {ledger.Transaction{TransactionInput: ledger.TransactionInput{Kind: "adjustment"}, Version: 1}, 1, true, "x", ledger.ErrNotCorrectable},
		"voided":                      {ledger.Transaction{TransactionInput: ledger.TransactionInput{Kind: "expense"}, Version: 3, Voided: true}, 3, false, "", ledger.ErrVoided},
		"void needs a reason":         {expense, 2, true, "  ", ledger.Invalid("reason", "")},
		"reason too long":             {expense, 2, false, string(make([]byte, 501)), ledger.Invalid("reason", "")},
		"void with a reason succeeds": {expense, 2, true, "duplicate", nil},
	} {
		if e := ledger.CheckRevisable(tc.old, tc.version, tc.void, tc.reason); (tc.want == nil) != (e == nil) || (tc.want != nil && !errors.Is(e, tc.want)) {
			t.Errorf("%s: %v", name, e)
		}
	}
	in, e := ledger.CorrectionInput(expense, ledger.TransactionInput{Kind: "expense", Note: "dinner"})
	if e != nil || in.Rate != "120.000000" || in.CategoryID != "food" || in.Note != "dinner" {
		t.Fatalf("omitted fields: %+v %v", in, e)
	}
	if _, e = ledger.CorrectionInput(expense, ledger.TransactionInput{Kind: "income"}); !errors.Is(e, ledger.ErrInvalid) {
		t.Fatalf("kind change: %v", e)
	}
	v := ledger.Void(expense, "duplicate")
	if !v.Voided || v.Reason != "duplicate" || v.Note != "lunch" || v.Version != 2 {
		t.Fatalf("void keeps content: %+v", v)
	}
}
