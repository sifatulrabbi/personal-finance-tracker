package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"simply-finance/internal/ledger"
)

// scheduleFacts loads the records a schedule names.
func scheduleFacts(tx dbtx, in ScheduleInput) (ledger.ScheduleFacts, error) {
	var f ledger.ScheduleFacts
	cid, _ := ledger.ResolveCategory("expense", in.CategoryID)
	var e error
	if f.CategoryFound, e = categoryExists(tx, cid, "expense"); e != nil {
		return f, e
	}
	f.Wallet, e = findWallet(tx, in.WalletID)
	return f, e
}

func (s *Store) CreateSchedule(ctx context.Context, actor, key string, in ScheduleInput) (Schedule, error) {
	return write(ctx, s, actor, key, "schedule.create", in, func(tx dbtx) (Schedule, error) {
		out := Schedule{ScheduleInput: in, ID: id(), Version: 1, Active: true}
		f, e := scheduleFacts(tx, in)
		if e != nil {
			return out, e
		}
		if e = ledger.ValidateSchedule(in, true, nil, s.addDays(-ledger.MaxScheduleBackfillDays), f); e != nil {
			return out, e
		}
		out.ScheduleInput = ledger.NormalizeSchedule(in)
		body, e := json.Marshal(out.ScheduleInput)
		if e != nil {
			return out, e
		}
		if _, e = tx.Exec(`INSERT INTO recurring_schedules(id,payload) VALUES(?,?)`, out.ID, string(body)); e != nil {
			return out, e
		}
		return out, s.audit(tx, actor, out.ID, "create", nil, out)
	})
}

// scheduleStates reads every schedule with the index of its next occurrence not stored yet.
func scheduleStates(tx dbtx) ([]ledger.ScheduleState, error) {
	rows, e := tx.Query(`SELECT id,payload,version,active,next_index FROM recurring_schedules ORDER BY id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []ledger.ScheduleState{}
	for rows.Next() {
		var a ledger.ScheduleState
		var body string
		if e = rows.Scan(&a.ID, &body, &a.Version, &a.Active, &a.NextIndex); e != nil {
			return nil, e
		}
		if e = json.Unmarshal([]byte(body), &a.ScheduleInput); e != nil {
			return nil, e
		}
		if a.CategoryID == "" {
			a.CategoryID = "others-expense"
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
func schedules(tx dbtx) ([]Schedule, error) {
	all, e := scheduleStates(tx)
	if e != nil {
		return nil, e
	}
	out := make([]Schedule, len(all))
	for i, a := range all {
		out[i] = a.Schedule
	}
	return out, nil
}
func (s *Store) Schedules(ctx context.Context) ([]Schedule, error) { return read(ctx, s, schedules) }

// materialize stores the occurrences of active schedules that have come due by today.
func (s *Store) materialize(tx dbtx) error {
	all, e := scheduleStates(tx)
	if e != nil {
		return e
	}
	today := s.today()
	for _, a := range all {
		if !a.Active {
			continue
		}
		dates, next := ledger.DueDates(a.Schedule, a.NextIndex, today)
		for _, date := range dates {
			if _, e = tx.Exec(`INSERT INTO bill_occurrences(id,schedule_id,due_date,wallet_id,amount,name,note,category_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(schedule_id,due_date) DO NOTHING`, id(), a.ID, date, a.WalletID, a.Amount, a.Name, a.Note, a.CategoryID); e != nil {
				return e
			}
		}
		if _, e = tx.Exec(`UPDATE recurring_schedules SET next_index=? WHERE id=?`, next, a.ID); e != nil {
			return e
		}
	}
	return nil
}

// Due stores the occurrences that have come due, so it runs as a write, and lists the due ones.
func (s *Store) Due(ctx context.Context) ([]Bill, error) { return change(ctx, s, s.due) }
func (s *Store) due(tx dbtx) ([]Bill, error) {
	if e := s.materialize(tx); e != nil {
		return nil, e
	}
	rows, e := tx.Query(`SELECT id,schedule_id,due_date,wallet_id,amount,name,note,status,category_id FROM bill_occurrences WHERE status='due' ORDER BY due_date,id`)
	if e != nil {
		return nil, e
	}
	out := []Bill{}
	for rows.Next() {
		var b Bill
		if e = rows.Scan(&b.ID, &b.ScheduleID, &b.DueDate, &b.WalletID, &b.Amount, &b.Name, &b.Note, &b.Status, &b.CategoryID); e != nil {
			rows.Close()
			return nil, e
		}
		out = append(out, b)
	}
	e = rows.Err()
	rows.Close()
	return out, e
}
func bill(tx dbtx, bid string) (Bill, error) {
	var b Bill
	var tid sql.NullString
	e := tx.QueryRow(`SELECT id,schedule_id,due_date,wallet_id,amount,name,note,status,transaction_id,category_id FROM bill_occurrences WHERE id=?`, bid).Scan(&b.ID, &b.ScheduleID, &b.DueDate, &b.WalletID, &b.Amount, &b.Name, &b.Note, &b.Status, &tid, &b.CategoryID)
	if errors.Is(e, sql.ErrNoRows) {
		return b, ErrNotFound
	}
	b.TransactionID = tid.String
	return b, e
}
func (s *Store) ConfirmBill(ctx context.Context, actor, key, bid string, in PaymentInput) (Transaction, error) {
	return write(ctx, s, actor, key, "bill.confirm", struct {
		ID    string
		Input PaymentInput
	}{bid, in}, func(tx dbtx) (Transaction, error) {
		b, e := bill(tx, bid)
		if e != nil {
			return Transaction{}, e
		}
		var f ledger.PaymentFacts
		if b.Status == "due" && in.NeedsWallets() {
			if f.BillWallet, e = findWallet(tx, b.WalletID); e != nil {
				return Transaction{}, e
			}
			if f.PaymentWallet, e = findWallet(tx, in.PaymentWalletID(b)); e != nil {
				return Transaction{}, e
			}
		}
		payment, e := ledger.BillPayment(b, in, f)
		if e != nil {
			return Transaction{}, e
		}
		out, e := s.createTransaction(tx, actor, payment)
		if e != nil {
			return out, e
		}
		if _, e = tx.Exec(`UPDATE bill_occurrences SET status='paid',transaction_id=? WHERE id=?`, out.ID, bid); e != nil {
			return out, e
		}
		return out, s.audit(tx, actor, bid, "confirm", b, map[string]string{"transaction_id": out.ID})
	})
}
func (s *Store) UpdateSchedule(ctx context.Context, actor, key string, in Schedule) (Schedule, error) {
	return write(ctx, s, actor, key, "schedule.update", in, func(tx dbtx) (Schedule, error) {
		if e := s.materialize(tx); e != nil {
			return in, e
		}
		old, e := schedule(tx, in.ID)
		if e != nil {
			return in, e
		}
		if e = ledger.CheckScheduleUpdate(old, in); e != nil {
			return in, e
		}
		f, e := scheduleFacts(tx, in.ScheduleInput)
		if e != nil {
			return in, e
		}
		if e = ledger.ValidateSchedule(in.ScheduleInput, in.Active, &old, "", f); e != nil {
			return in, e
		}
		in.ScheduleInput = ledger.NormalizeSchedule(in.ScheduleInput)
		in.Version++
		body, e := json.Marshal(in.ScheduleInput)
		if e != nil {
			return in, e
		}
		if _, e = tx.Exec(`UPDATE recurring_schedules SET payload=?,version=?,active=? WHERE id=?`, string(body), in.Version, in.Active, in.ID); e != nil {
			return in, e
		}
		return in, s.audit(tx, actor, in.ID, "update", old, in)
	})
}
func (s *Store) SkipBill(ctx context.Context, actor, key, bid, reason string) (Bill, error) {
	return write(ctx, s, actor, key, "bill.skip", struct{ ID, Reason string }{bid, reason}, func(tx dbtx) (Bill, error) {
		b, e := bill(tx, bid)
		if e != nil {
			return b, e
		}
		if e = ledger.CheckSkip(b, reason); e != nil {
			return b, e
		}
		old := b
		b.Status = "skipped"
		if _, e = tx.Exec(`UPDATE bill_occurrences SET status='skipped' WHERE id=?`, bid); e != nil {
			return b, e
		}
		return b, s.audit(tx, actor, bid, "skip", old, map[string]any{"bill": b, "reason": reason})
	})
}
