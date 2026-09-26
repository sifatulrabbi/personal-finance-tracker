package ledger_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"simply-finance/internal/ledger"
	"simply-finance/internal/money"
)

func TestTargetForInheritsTheLatestEarlierSavedTarget(t *testing.T) {
	amount, zero := int64(5000000), int64(0)
	for name, tc := range map[string]struct {
		latest *ledger.SavedTarget
		want   ledger.MonthlyTarget
	}{
		"none saved":         {nil, ledger.MonthlyTarget{Version: 1}},
		"own target":         {&ledger.SavedTarget{Month: "2026-09", Amount: &amount, Version: 3}, ledger.MonthlyTarget{Amount: "50000.00", Version: 3}},
		"inherited":          {&ledger.SavedTarget{Month: "2026-07", Amount: &amount, Version: 3}, ledger.MonthlyTarget{Amount: "50000.00", Version: 1, InheritedFrom: "2026-07"}},
		"zero is inherited":  {&ledger.SavedTarget{Month: "2026-07", Amount: &zero, Version: 2}, ledger.MonthlyTarget{Amount: "0.00", Version: 1, InheritedFrom: "2026-07"}},
		"own row, no amount": {&ledger.SavedTarget{Month: "2026-09", Version: 2}, ledger.MonthlyTarget{Version: 2}},
	} {
		if got := ledger.TargetFor("2026-09", tc.latest); got != tc.want {
			t.Errorf("%s: %+v", name, got)
		}
	}
	if _, e := ledger.ParseTarget("2026-13", "1"); !errors.Is(e, ledger.ErrMonth) {
		t.Fatalf("month: %v", e)
	}
	if _, e := ledger.ParseTarget("2026-09", "-1"); e == nil {
		t.Fatal("negative target accepted")
	}
	if n, e := ledger.ParseTarget("2026-09", "0"); e != nil || n != 0 {
		t.Fatalf("zero target: %d %v", n, e)
	}
	next, e := ledger.SetTarget(ledger.MonthlyTarget{Version: 1, InheritedFrom: "2026-07", Amount: "1.00"}, 1, 250)
	if e != nil || next != (ledger.MonthlyTarget{Amount: "2.50", Version: 2}) {
		t.Fatalf("first own target is version 2: %+v %v", next, e)
	}
	if _, e = ledger.SetTarget(ledger.MonthlyTarget{Version: 2}, 1, 250); !errors.Is(e, ledger.ErrStaleVersion) {
		t.Fatalf("stale: %v", e)
	}
}

func TestSumMonthSharesUseActualSpending(t *testing.T) {
	categories := []ledger.CategorySpending{{CategoryID: "food", Name: "Food"}, {CategoryID: "others-expense", Name: "Others"}, {CategoryID: "rent", Name: "Rent"}}
	expenses := []ledger.Expense{{CategoryID: "food", BDTMinor: 100, HasBDT: true}, {CategoryID: "food", BDTMinor: 100, HasBDT: true}, {CategoryID: "others-expense", BDTMinor: 100, HasBDT: true}}
	spent, out, e := ledger.SumMonth("2026-09", categories, expenses)
	if e != nil || spent != "3.00" {
		t.Fatalf("%s %v", spent, e)
	}
	want := []ledger.CategorySpending{{CategoryID: "food", Name: "Food", Spent: "2.00", Percentage: "66.67"}, {CategoryID: "others-expense", Name: "Others", Spent: "1.00", Percentage: "33.33"}, {CategoryID: "rent", Name: "Rent", Spent: "0.00", Percentage: "0.00"}}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("%+v", out)
	}
	if categories[0].Spent != "" {
		t.Fatal("SumMonth changed its input")
	}
	spent, out, e = ledger.SumMonth("2026-09", categories, nil)
	if e != nil || spent != "0.00" || out[0].Percentage != "0.00" {
		t.Fatalf("no spending: %s %+v %v", spent, out, e)
	}
	spent, out, e = ledger.SumMonth("2026-09", nil, nil)
	if e != nil || out == nil || len(out) != 0 {
		t.Fatalf("no categories is an empty list: %s %#v %v", spent, out, e)
	}
	// Totals beyond int64 stay exact.
	many := []ledger.Expense{}
	for i := 0; i < 3; i++ {
		many = append(many, ledger.Expense{CategoryID: "food", BDTMinor: money.MaxMoney, HasBDT: true})
	}
	spent, _, e = ledger.SumMonth("2026-09", categories, many)
	if e != nil || spent != "270000000000.00" {
		t.Fatalf("large total: %s %v", spent, e)
	}
	if _, _, e = ledger.SumMonth("2026-09", categories, []ledger.Expense{{CategoryID: "food"}}); e == nil || !strings.Contains(e.Error(), "no BDT value") {
		t.Fatalf("missing BDT: %v", e)
	}
	if _, _, e = ledger.SumMonth("2026-09", categories, []ledger.Expense{{CategoryID: "salary", HasBDT: true}}); e == nil || !strings.Contains(e.Error(), "unknown category") {
		t.Fatalf("unknown category: %v", e)
	}
}

func TestTotalsKeepCashDebtAndLinkedCardsApart(t *testing.T) {
	amounts := func(w ledger.Wallet, limit, balance int64) ledger.Wallet {
		w.SetAmounts(limit, balance)
		return w
	}
	wallets := []ledger.Wallet{
		amounts(cashBDT, 0, 1000),
		amounts(archived, 0, 500),     // archived wallets keep their balance
		amounts(credit, 10000, -2500), // debt, not negative cash
		amounts(debit, 0, 0),          // a linked card has no balance of its own
		amounts(legacy, 0, 300),       // a legacy card's own balance is still cash
		amounts(bankUSD, 0, 700),
	}
	totals, legacyCards := ledger.Totals(wallets)
	want := []ledger.CurrencyTotal{{Currency: "BDT", Cash: "18.00", CardDebt: "25.00", AvailableCredit: "75.00"}, {Currency: "USD", Cash: "7.00", CardDebt: "0.00", AvailableCredit: "0.00"}}
	if !reflect.DeepEqual(totals, want) || legacyCards != 1 {
		t.Fatalf("%+v %d", totals, legacyCards)
	}
}

func TestSettingsCategoryAndProfileRules(t *testing.T) {
	old := ledger.Settings{Version: 2}
	if n, e := ledger.ParseRateChange(old, 2, "121.5"); e != nil || n != 121_500_000 {
		t.Fatalf("rate: %d %v", n, e)
	}
	if _, e := ledger.ParseRateChange(old, 1, "121.5"); !errors.Is(e, ledger.ErrStaleVersion) {
		t.Fatalf("stale before parse: %v", e)
	}
	if code, field := fieldOf(func() error { _, e := ledger.ParseRateChange(old, 2, "0"); return e }()); code != "validation_failed" || field != "rate" {
		t.Fatalf("zero rate: %s/%s", code, field)
	}
	for in, field := range map[ledger.CategoryInput]string{{Name: "Food", Type: "expense"}: "", {Name: "Food", Type: "transfer"}: "type", {Name: " ", Type: "income"}: "name", {Name: strings.Repeat("x", 121), Type: "income"}: "name"} {
		if _, got := fieldOf(ledger.ValidateCategory(in)); got != field {
			t.Errorf("%+v: %q", in, got)
		}
	}
	if email, e := ledger.NormalizeEmail("  Sifatul@Example.TEST "); e != nil || email != "sifatul@example.test" {
		t.Fatalf("normalize: %q %v", email, e)
	}
	for _, bad := range []string{"", "Name <a@b.test>", "not an email", strings.Repeat("a", 250) + "@b.test"} {
		if _, e := ledger.NormalizeEmail(bad); !errors.Is(e, ledger.ErrInvalid) {
			t.Errorf("accepted %q", bad)
		}
	}
	if email, name, e := ledger.Profile("a@b.test", ""); e != nil || email != "a@b.test" || name != "a@b.test" {
		t.Fatalf("empty name is the email: %q %q %v", email, name, e)
	}
	if _, _, e := ledger.Profile("a@b.test", strings.Repeat("x", 121)); e == nil {
		t.Fatal("long name accepted")
	}
}
