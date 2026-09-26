package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"simply-finance/internal/ledger"
)

// Transaction reads one record's current revision with its author and revision time.
func (s *Store) Transaction(ctx context.Context, tid string) (Transaction, error) {
	return read(ctx, s, func(tx dbtx) (Transaction, error) {
		items, _, e := listTransactions(tx, listSelect+` WHERE t.id=?`, tid)
		if e != nil {
			return Transaction{}, e
		}
		if len(items) == 0 {
			return Transaction{}, ErrNotFound
		}
		return items[0], nil
	})
}

// Schedule reads one recurring schedule.
func (s *Store) Schedule(ctx context.Context, sid string) (Schedule, error) {
	return read(ctx, s, func(tx dbtx) (Schedule, error) { return schedule(tx, sid) })
}
func schedule(tx dbtx, sid string) (Schedule, error) {
	var a Schedule
	var body string
	e := tx.QueryRow(`SELECT id,payload,version,active FROM recurring_schedules WHERE id=?`, sid).Scan(&a.ID, &body, &a.Version, &a.Active)
	if errors.Is(e, sql.ErrNoRows) {
		return a, ErrNotFound
	}
	if e != nil {
		return a, e
	}
	if e = json.Unmarshal([]byte(body), &a.ScheduleInput); e != nil {
		return a, e
	}
	if a.CategoryID == "" {
		a.CategoryID = "others-expense"
	}
	return a, nil
}

// Bills lists stored occurrences by status. Listing due bills first creates any occurrences that
// have come due, exactly as Due does; paid and skipped bills are plain reads, newest first.
func (s *Store) Bills(ctx context.Context, status string, limit, offset int) ([]Bill, error) {
	if status == "" {
		status = "due"
	}
	order := "due_date DESC,id"
	switch status {
	case "due":
		order = "due_date,id"
	case "paid", "skipped":
	default:
		return nil, ledger.Invalid("status", "Choose due, paid, or skipped.")
	}
	if e := validPage(limit, offset); e != nil {
		return nil, e
	}
	list := func(tx dbtx) ([]Bill, error) {
		if status == "due" {
			if e := s.materialize(tx); e != nil {
				return nil, e
			}
		}
		return bills(tx, status, order, limit, offset)
	}
	// Listing due bills stores the ones that have come due, so it runs as a write.
	if status == "due" {
		return change(ctx, s, list)
	}
	return read(ctx, s, list)
}
func bills(tx dbtx, status, order string, limit, offset int) ([]Bill, error) {
	rows, e := tx.Query(`SELECT id,schedule_id,due_date,wallet_id,amount,name,note,status,COALESCE(transaction_id,''),category_id FROM bill_occurrences WHERE status=? ORDER BY `+order+` LIMIT ? OFFSET ?`, status, limit, offset)
	if e != nil {
		return nil, e
	}
	out := []Bill{}
	for rows.Next() {
		var b Bill
		if e = rows.Scan(&b.ID, &b.ScheduleID, &b.DueDate, &b.WalletID, &b.Amount, &b.Name, &b.Note, &b.Status, &b.TransactionID, &b.CategoryID); e != nil {
			rows.Close()
			return nil, e
		}
		out = append(out, b)
	}
	e = rows.Err()
	rows.Close()
	return out, e
}

const (
	MaxUpcomingDays  = 366
	MaxUpcomingBills = 200
)

// pending computes the occurrences of active schedules that are not stored yet, dated on or
// before through.
func pending(tx dbtx, through string) ([]UpcomingBill, error) {
	all, e := scheduleStates(tx)
	if e != nil {
		return nil, e
	}
	return ledger.Pending(all, through), nil
}

// Upcoming lists occurrences dated after today (Asia/Dhaka) through today plus days, at most
// MaxUpcomingBills, earliest first. It reads only.
func (s *Store) Upcoming(ctx context.Context, days int) ([]UpcomingBill, error) {
	if days < 1 || days > MaxUpcomingDays {
		return nil, ledger.Invalid("days", "Use a number of days from 1 to 366.")
	}
	through, today := s.addDays(days), s.today()
	return read(ctx, s, func(tx dbtx) ([]UpcomingBill, error) {
		all, e := pending(tx, through)
		if e != nil {
			return nil, e
		}
		return ledger.Upcoming(all, today, MaxUpcomingBills), nil
	})
}

const summaryUpcomingDays = 90

// Summary reads without writing. Cash is the balance of every non-credit wallet, archived ones
// included because an archived wallet keeps its balance; a linked debit card has none, and a
// legacy debit card's own recorded balance counts until it is drained. Bills that have come due
// but are not stored yet count as due.
func (s *Store) Summary(ctx context.Context) (Summary, error) {
	today := s.today()
	return read(ctx, s, func(tx dbtx) (Summary, error) { return summary(tx, today, s.addDays(summaryUpcomingDays)) })
}

// summary reads every figure from one snapshot, so the totals, spending, and recent records agree.
func summary(tx dbtx, today, upcomingThrough string) (Summary, error) {
	out := Summary{Today: today}
	all, e := wallets(tx)
	if e != nil {
		return out, e
	}
	out.Totals, out.LegacyDebitCards = ledger.Totals(all)
	month, e := monthly(tx, today[:7])
	if e != nil {
		return out, e
	}
	out.Month = MonthSummary{Month: month.Month, Spent: month.Spent, Target: month.Target}
	if out.Bills, e = billSummary(tx, today, upcomingThrough); e != nil {
		return out, e
	}
	out.Recent, e = recentTransactions(tx, 5, 0)
	return out, e
}

func billSummary(tx dbtx, today, upcomingThrough string) (BillSummary, error) {
	var out BillSummary
	var oldest sql.NullString
	if e := tx.QueryRow(`SELECT count(*),min(due_date) FROM bill_occurrences WHERE status='due'`).Scan(&out.DueCount, &oldest); e != nil {
		return out, e
	}
	all, e := pending(tx, upcomingThrough)
	if e != nil {
		return out, e
	}
	return ledger.SummarizeBills(out.DueCount, oldest.String, all, today), nil
}
