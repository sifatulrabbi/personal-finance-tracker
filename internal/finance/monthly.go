package finance

import (
	"context"
	"database/sql"
	"encoding/json"
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
	}{month, amount, version}, func(tx *sql.Tx) (MonthlyTarget, error) {
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
func decimalHundredths(n *big.Int) string {
	whole, fraction := new(big.Int), new(big.Int)
	whole.QuoRem(n, big.NewInt(100), fraction)
	return whole.String() + "." + leftPad(fraction.String(), 2)
}
func (s *Store) Monthly(ctx context.Context, month string) (MonthlySpending, error) {
	if month == "" {
		month = s.today()[:7]
	}
	out := MonthlySpending{Month: month, Categories: []CategorySpending{}}
	if !validMonth(month) {
		return out, errMonth
	}
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return out, e
	}
	defer tx.Rollback()
	out.Target, e = monthlyTarget(tx, month)
	if e != nil {
		return out, e
	}
	rows, e := tx.QueryContext(ctx, `SELECT id,name FROM categories WHERE type='expense' ORDER BY name,id`)
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
	rows, e = tx.QueryContext(ctx, `SELECT r.payload FROM transactions t JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version WHERE t.voided=0 AND json_extract(r.payload,'$.kind')='expense' AND substr(json_extract(r.payload,'$.date'),1,7)=?`, month)
	if e != nil {
		return out, e
	}
	total := new(big.Int)
	for rows.Next() {
		var body string
		var r Transaction
		if e = rows.Scan(&body); e != nil {
			rows.Close()
			return out, e
		}
		if e = json.Unmarshal([]byte(body), &r); e != nil {
			rows.Close()
			return out, e
		}
		defaultCategory(&r)
		n, err := ParseMoney(r.BDTAmount)
		if err != nil {
			rows.Close()
			return out, err
		}
		a, ok := amounts[r.CategoryID]
		if !ok {
			rows.Close()
			return out, fmt.Errorf("monthly: expense %s has unknown category", r.ID)
		}
		a.Add(a, big.NewInt(n))
		total.Add(total, big.NewInt(n))
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
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
