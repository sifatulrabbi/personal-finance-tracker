package finance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
)

// MonthlyTarget is a month's own saved target or, when it has none, the latest earlier saved one.
// InheritedFrom names the month the amount came from when it is not the month's own. A month
// without its own target reports version 1; its first explicit target is saved as version 2.
type MonthlyTarget struct {
	Amount        string `json:"amount"`
	Version       int    `json:"version"`
	InheritedFrom string `json:"inherited_from,omitempty"`
}
type CategorySpending struct {
	CategoryID string `json:"category_id"`
	Name       string `json:"name"`
	Spent      string `json:"spent"`
	Percentage string `json:"percentage"`
}
type MonthlySpending struct {
	Month      string             `json:"month"`
	Spent      string             `json:"spent"`
	Target     MonthlyTarget      `json:"target"`
	Categories []CategorySpending `json:"categories"`
}

func validMonth(month string) bool { return len(month) == 7 && validDate(month+"-01") }

var errMonth = invalid("month", "Enter a month as YYYY-MM.")

// monthlyTarget reads without writing: the month's own row, else the latest earlier saved row.
func monthlyTarget(q querier, month string) (MonthlyTarget, error) {
	out := MonthlyTarget{Version: 1}
	var saved string
	var n sql.NullInt64
	var version int
	e := q.QueryRow(`SELECT month,amount,version FROM monthly_targets WHERE month<=? ORDER BY month DESC LIMIT 1`, month).Scan(&saved, &n, &version)
	if errors.Is(e, sql.ErrNoRows) {
		return out, nil
	}
	if e != nil {
		return out, e
	}
	if n.Valid {
		out.Amount = FormatMoney(n.Int64)
	}
	if saved == month {
		out.Version = version
	} else {
		out.InheritedFrom = saved
	}
	return out, nil
}
func (s *Store) SetMonthlyTarget(ctx context.Context, actor, key, month, amount string, version int) (MonthlyTarget, error) {
	return write(ctx, s, actor, key, "monthly.target", struct {
		Month, Amount string
		Version       int
	}{month, amount, version}, func(tx dbtx) (MonthlyTarget, error) {
		if !validMonth(month) {
			return MonthlyTarget{}, errMonth
		}
		n, e := ParseMoney(amount)
		if e != nil || n < 0 {
			return MonthlyTarget{}, invalid("amount", "Enter a target of zero or more, with at most two decimal places.")
		}
		old, e := monthlyTarget(tx, month)
		if e != nil {
			return old, e
		}
		if old.Version != version {
			return old, ErrStaleVersion
		}
		if _, e = tx.Exec(`INSERT INTO monthly_targets(month,amount,version) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET amount=excluded.amount,version=excluded.version`, month, n, old.Version+1); e != nil {
			return old, e
		}
		out := MonthlyTarget{Amount: FormatMoney(n), Version: old.Version + 1}
		return out, s.audit(tx, actor, month, "monthly.target", old, out)
	})
}

// decimalHundredths formats a count of hundredths, such as minor units, as a decimal string. The
// sign is formatted separately because the summary's cash and debt totals can be negative.
func decimalHundredths(n *big.Int) string {
	sign := ""
	if n.Sign() < 0 {
		sign = "-"
	}
	whole, fraction := new(big.Int), new(big.Int)
	whole.QuoRem(new(big.Int).Abs(n), big.NewInt(100), fraction)
	return sign + whole.String() + "." + leftPad(fraction.String(), 2)
}
func (s *Store) Monthly(ctx context.Context, month string) (MonthlySpending, error) {
	if month == "" {
		month = s.today()[:7]
	}
	if !validMonth(month) {
		return MonthlySpending{Month: month, Categories: []CategorySpending{}}, errMonth
	}
	return read(ctx, s, func(tx dbtx) (MonthlySpending, error) { return monthly(tx, month) })
}

// monthly sums the month's current, non-voided expenses at their saved BDT values from the typed
// columns (ADR 0012), in arbitrary precision (ADR 0005).
func monthly(tx dbtx, month string) (MonthlySpending, error) {
	out := MonthlySpending{Month: month, Categories: []CategorySpending{}}
	var e error
	out.Target, e = monthlyTarget(tx, month)
	if e != nil {
		return out, e
	}
	rows, e := tx.Query(`SELECT id,name FROM categories WHERE type='expense' ORDER BY name,id`)
	if e != nil {
		return out, e
	}
	amounts := map[string]*big.Int{}
	for rows.Next() {
		var c CategorySpending
		if e = rows.Scan(&c.CategoryID, &c.Name); e != nil {
			rows.Close()
			return out, e
		}
		out.Categories = append(out.Categories, c)
		amounts[c.CategoryID] = new(big.Int)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return out, e
	}
	// Dates are validated YYYY-MM-DD strings, so the month is one lexical range.
	rows, e = tx.Query(`SELECT category_id,bdt_minor FROM transactions WHERE kind='expense' AND voided=0 AND date>=? AND date<=?`, month+"-01", month+"-31")
	if e != nil {
		return out, e
	}
	defer rows.Close()
	total := new(big.Int)
	for rows.Next() {
		var category sql.NullString
		var n sql.NullInt64
		if e = rows.Scan(&category, &n); e != nil {
			return out, e
		}
		if !n.Valid {
			return out, fmt.Errorf("monthly: an expense in %s has no BDT value", month)
		}
		a, ok := amounts[category.String]
		if !ok {
			return out, fmt.Errorf("monthly: an expense in %s has unknown category %q", month, category.String)
		}
		a.Add(a, big.NewInt(n.Int64))
		total.Add(total, big.NewInt(n.Int64))
	}
	if e = rows.Err(); e != nil {
		return out, e
	}
	out.Spent = decimalHundredths(total)
	for i := range out.Categories {
		c := &out.Categories[i]
		n := amounts[c.CategoryID]
		c.Spent = decimalHundredths(n)
		percent := new(big.Int)
		if total.Sign() > 0 {
			percent.Mul(n, big.NewInt(10000))
			percent.Add(percent, new(big.Int).Quo(total, big.NewInt(2)))
			percent.Quo(percent, total)
		}
		c.Percentage = decimalHundredths(percent)
	}
	return out, nil
}
