package ledger

import (
	"fmt"
	"math/big"

	"simply-finance/internal/money"
)

// ErrMonth refuses a month that is not YYYY-MM.
var ErrMonth = Invalid("month", "Enter a month as YYYY-MM.")

// SavedTarget is a stored monthly target row. A nil Amount is a row with no amount.
type SavedTarget struct {
	Month   string
	Amount  *int64
	Version int
}

// TargetFor is month's target given the latest saved target on or before it (nil when none): the
// month's own target, else the inherited one naming its source month (ADR 0010). A month without
// its own target reports version 1.
func TargetFor(month string, latest *SavedTarget) MonthlyTarget {
	out := MonthlyTarget{Version: 1}
	if latest == nil {
		return out
	}
	if latest.Amount != nil {
		out.Amount = money.FormatMoney(*latest.Amount)
	}
	if latest.Month == month {
		out.Version = latest.Version
	} else {
		out.InheritedFrom = latest.Month
	}
	return out
}

// ParseTarget checks a target change's month and amount; zero is a valid target.
func ParseTarget(month, amount string) (int64, error) {
	if !ValidMonth(month) {
		return 0, ErrMonth
	}
	n, err := money.ParseMoney(amount)
	if err != nil || n < 0 {
		return 0, Invalid("amount", "Enter a target of zero or more, with at most two decimal places.")
	}
	return n, nil
}

// SetTarget is the target saved when amount replaces old, whose version the writer read.
func SetTarget(old MonthlyTarget, version int, amount int64) (MonthlyTarget, error) {
	if old.Version != version {
		return old, ErrStaleVersion
	}
	return MonthlyTarget{Amount: money.FormatMoney(amount), Version: old.Version + 1}, nil
}

// Expense is one current, non-voided expense of a month, at its saved BDT value.
type Expense struct {
	CategoryID string
	BDTMinor   int64
	HasBDT     bool
}

// SumMonth totals a month's expenses by category, in arbitrary precision (ADR 0005). categories
// lists every expense category in display order; each share is the category's spending divided by
// the month's total spending, rounded half up to hundredths of a percent, and zero when nothing was
// spent. It returns the total spent and the categories with their spending and shares.
func SumMonth(month string, categories []CategorySpending, expenses []Expense) (string, []CategorySpending, error) {
	amounts := map[string]*big.Int{}
	for _, c := range categories {
		amounts[c.CategoryID] = new(big.Int)
	}
	total := new(big.Int)
	for _, ex := range expenses {
		if !ex.HasBDT {
			return "", nil, fmt.Errorf("monthly: an expense in %s has no BDT value", month)
		}
		a, ok := amounts[ex.CategoryID]
		if !ok {
			return "", nil, fmt.Errorf("monthly: an expense in %s has unknown category %q", month, ex.CategoryID)
		}
		a.Add(a, big.NewInt(ex.BDTMinor))
		total.Add(total, big.NewInt(ex.BDTMinor))
	}
	out := make([]CategorySpending, len(categories))
	for i, c := range categories {
		n := amounts[c.CategoryID]
		c.Spent = money.FormatHundredths(n)
		percent := new(big.Int)
		if total.Sign() > 0 {
			percent.Mul(n, big.NewInt(10000))
			percent.Add(percent, new(big.Int).Quo(total, big.NewInt(2)))
			percent.Quo(percent, total)
		}
		c.Percentage = money.FormatHundredths(percent)
		out[i] = c
	}
	return money.FormatHundredths(total), out, nil
}

// Totals sums wallet balances by currency, BDT then USD. Cash is the balance of every non-credit
// wallet, archived ones included because an archived wallet keeps its balance; a linked debit card
// has none, and a legacy debit card's own recorded balance counts until it is drained. Card debt
// and available credit are kept apart from cash. It also counts the legacy debit cards.
func Totals(wallets []Wallet) ([]CurrencyTotal, int) {
	type sums struct{ cash, debt, available *big.Int }
	currencies := []string{"BDT", "USD"}
	byCurrency := map[string]*sums{}
	for _, currency := range currencies {
		byCurrency[currency] = &sums{new(big.Int), new(big.Int), new(big.Int)}
	}
	legacy := 0
	for _, w := range wallets {
		t := byCurrency[w.Currency]
		switch {
		case w.CardType == "credit":
			t.debt.Add(t.debt, big.NewInt(money.MustMoney(w.Debt)))
			t.available.Add(t.available, big.NewInt(money.MustMoney(w.AvailableCredit)))
		case w.CardType == "debit" && !w.LegacyDebit():
		default:
			if w.LegacyDebit() {
				legacy++
			}
			t.cash.Add(t.cash, big.NewInt(money.MustMoney(w.Balance)))
		}
	}
	out := []CurrencyTotal{}
	for _, currency := range currencies {
		t := byCurrency[currency]
		out = append(out, CurrencyTotal{currency, money.FormatHundredths(t.cash), money.FormatHundredths(t.debt), money.FormatHundredths(t.available)})
	}
	return out, legacy
}
