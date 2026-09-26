package finance

import (
	"context"
	"database/sql"
	"errors"

	"simply-finance/internal/ledger"
)

// monthlyTarget reads without writing: the month's own row, else the latest earlier saved row.
func monthlyTarget(q querier, month string) (MonthlyTarget, error) {
	var saved ledger.SavedTarget
	var n sql.NullInt64
	e := q.QueryRow(`SELECT month,amount,version FROM monthly_targets WHERE month<=? ORDER BY month DESC LIMIT 1`, month).Scan(&saved.Month, &n, &saved.Version)
	if errors.Is(e, sql.ErrNoRows) {
		return ledger.TargetFor(month, nil), nil
	}
	if e != nil {
		return MonthlyTarget{Version: 1}, e
	}
	if n.Valid {
		saved.Amount = &n.Int64
	}
	return ledger.TargetFor(month, &saved), nil
}
func (s *Store) SetMonthlyTarget(ctx context.Context, actor, key, month, amount string, version int) (MonthlyTarget, error) {
	return write(ctx, s, actor, key, "monthly.target", struct {
		Month, Amount string
		Version       int
	}{month, amount, version}, func(tx dbtx) (MonthlyTarget, error) {
		n, e := ledger.ParseTarget(month, amount)
		if e != nil {
			return MonthlyTarget{}, e
		}
		old, e := monthlyTarget(tx, month)
		if e != nil {
			return old, e
		}
		out, e := ledger.SetTarget(old, version, n)
		if e != nil {
			return old, e
		}
		if _, e = tx.Exec(`INSERT INTO monthly_targets(month,amount,version) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET amount=excluded.amount,version=excluded.version`, month, n, out.Version); e != nil {
			return old, e
		}
		return out, s.audit(tx, actor, month, "monthly.target", old, out)
	})
}

func (s *Store) Monthly(ctx context.Context, month string) (MonthlySpending, error) {
	if month == "" {
		month = s.today()[:7]
	}
	if !ledger.ValidMonth(month) {
		return MonthlySpending{Month: month, Categories: []CategorySpending{}}, ledger.ErrMonth
	}
	return read(ctx, s, func(tx dbtx) (MonthlySpending, error) { return monthly(tx, month) })
}

// monthly sums the month's current, non-voided expenses at their saved BDT values from the typed
// columns (ADR 0012).
func monthly(tx dbtx, month string) (MonthlySpending, error) {
	out := MonthlySpending{Month: month, Categories: []CategorySpending{}}
	var e error
	out.Target, e = monthlyTarget(tx, month)
	if e != nil {
		return out, e
	}
	categories, e := expenseCategories(tx)
	if e != nil {
		return out, e
	}
	expenses, e := monthExpenses(tx, month)
	if e != nil {
		return out, e
	}
	out.Spent, out.Categories, e = ledger.SumMonth(month, categories, expenses)
	if e != nil {
		out.Spent, out.Categories = "", []CategorySpending{}
	}
	return out, e
}

// expenseCategories lists every expense category in display order, with no spending yet.
func expenseCategories(tx dbtx) ([]CategorySpending, error) {
	rows, e := tx.Query(`SELECT id,name FROM categories WHERE type='expense' ORDER BY name,id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []CategorySpending{}
	for rows.Next() {
		var c CategorySpending
		if e = rows.Scan(&c.CategoryID, &c.Name); e != nil {
			return nil, e
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// monthExpenses reads the month's current, non-voided expenses. Dates are validated YYYY-MM-DD
// strings, so the month is one lexical range.
func monthExpenses(tx dbtx, month string) ([]ledger.Expense, error) {
	rows, e := tx.Query(`SELECT category_id,bdt_minor FROM transactions WHERE kind='expense' AND voided=0 AND date>=? AND date<=?`, month+"-01", month+"-31")
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []ledger.Expense{}
	for rows.Next() {
		var category sql.NullString
		var n sql.NullInt64
		if e = rows.Scan(&category, &n); e != nil {
			return nil, e
		}
		out = append(out, ledger.Expense{CategoryID: category.String, BDTMinor: n.Int64, HasBDT: n.Valid})
	}
	return out, rows.Err()
}
