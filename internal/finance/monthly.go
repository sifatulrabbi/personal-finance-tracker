package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"math/big"
	"time"
)

type MonthlyTarget struct {
	Amount  string `json:"amount"`
	Version int    `json:"version"`
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
func monthlyTarget(tx *sql.Tx, month string) (MonthlyTarget, error) {
	var out MonthlyTarget
	date, _ := time.Parse("2006-01", month)
	previous := date.AddDate(0, -1, 0).Format("2006-01")
	if _, e := tx.Exec(`INSERT INTO monthly_targets(month,amount) VALUES(?,(SELECT amount FROM monthly_targets WHERE month=?)) ON CONFLICT(month) DO NOTHING`, month, previous); e != nil {
		return out, e
	}
	var n sql.NullInt64
	e := tx.QueryRow(`SELECT amount,version FROM monthly_targets WHERE month=?`, month).Scan(&n, &out.Version)
	if n.Valid {
		out.Amount = FormatMoney(n.Int64)
	}
	return out, e
}
func (s *Store) SetMonthlyTarget(ctx context.Context, actor, key, month, amount string, version int) (MonthlyTarget, error) {
	return write(ctx, s, actor, key, "monthly.target", struct {
		Month, Amount string
		Version       int
	}{month, amount, version}, func(tx *sql.Tx) (MonthlyTarget, error) {
		if !validMonth(month) {
			return MonthlyTarget{}, ErrInvalid
		}
		n, e := ParseMoney(amount)
		if e != nil || n < 0 {
			return MonthlyTarget{}, ErrInvalid
		}
		old, e := monthlyTarget(tx, month)
		if e != nil {
			return old, e
		}
		if old.Version != version {
			return old, ErrConflict
		}
		if _, e = tx.Exec(`UPDATE monthly_targets SET amount=?,version=version+1 WHERE month=?`, n, month); e != nil {
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
		return out, ErrInvalid
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
			return out, ErrInvalid
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
	return out, tx.Commit()
}
