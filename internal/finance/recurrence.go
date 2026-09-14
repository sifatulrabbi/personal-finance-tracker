package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

type ScheduleInput struct {
	CategoryID string `json:"category_id,omitempty"`
	Name       string `json:"name"`
	WalletID   string `json:"wallet_id"`
	Amount     string `json:"amount"`
	StartDate  string `json:"start_date"`
	EndDate    string `json:"end_date,omitempty"`
	Frequency  string `json:"frequency"`
	Note       string `json:"note"`
}
type Schedule struct {
	ScheduleInput
	ID      string `json:"id"`
	Version int    `json:"version"`
	Active  bool   `json:"active"`
}
type Bill struct {
	CategoryID    string `json:"category_id"`
	ID            string `json:"id"`
	ScheduleID    string `json:"schedule_id"`
	DueDate       string `json:"due_date"`
	WalletID      string `json:"wallet_id"`
	Amount        string `json:"amount"`
	Name          string `json:"name"`
	Note          string `json:"note"`
	Status        string `json:"status"`
	TransactionID string `json:"transaction_id,omitempty"`
}
type PaymentInput struct {
	Amount   string `json:"amount"`
	WalletID string `json:"wallet_id"`
	Date     string `json:"date"`
	Note     string `json:"note"`
	Rate     string `json:"rate"`
}

func validateSchedule(tx *sql.Tx, in ScheduleInput) error {
	if _, e := categoryID(tx, "expense", in.CategoryID); e != nil {
		return e
	}
	if strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 || len(in.Note) > 2000 {
		return ErrInvalid
	}
	if _, e := OccurrenceDate(in.StartDate, in.Frequency, 0); e != nil {
		return e
	}
	if in.EndDate != "" && (!validDate(in.EndDate) || in.EndDate < in.StartDate) {
		return ErrInvalid
	}
	n, e := ParseMoney(in.Amount)
	if e != nil || n <= 0 {
		return ErrInvalid
	}
	w, e := wallet(tx, in.WalletID)
	if e != nil {
		return e
	}
	if w.Archived {
		return ErrInvalid
	}
	return nil
}
func (s *Store) CreateSchedule(ctx context.Context, actor, key string, in ScheduleInput) (Schedule, error) {
	return write(ctx, s, actor, key, "schedule.create", in, func(tx *sql.Tx) (Schedule, error) {
		out := Schedule{ScheduleInput: in, ID: id(), Version: 1, Active: true}
		if e := validateSchedule(tx, in); e != nil {
			return out, e
		}
		out.Amount = FormatMoney(mustMoney(in.Amount))
		out.CategoryID, _ = categoryID(tx, "expense", in.CategoryID)
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
func schedules(tx *sql.Tx) ([]Schedule, error) {
	rows, e := tx.Query(`SELECT id,payload,version,active FROM recurring_schedules ORDER BY id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Schedule{}
	for rows.Next() {
		var a Schedule
		var body string
		if e = rows.Scan(&a.ID, &body, &a.Version, &a.Active); e != nil {
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
func (s *Store) Schedules(ctx context.Context) ([]Schedule, error) {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	return schedules(tx)
}
func (s *Store) materialize(tx *sql.Tx) error {
	all, e := schedules(tx)
	if e != nil {
		return e
	}
	for _, a := range all {
		if !a.Active {
			continue
		}
		var index int
		if e = tx.QueryRow(`SELECT next_index FROM recurring_schedules WHERE id=?`, a.ID).Scan(&index); e != nil {
			return e
		}
		for ; index <= 10000; index++ {
			date, e := OccurrenceDate(a.StartDate, a.Frequency, index)
			if e != nil {
				break
			}
			if date > s.today() || (a.EndDate != "" && date > a.EndDate) {
				break
			}
			if _, e = tx.Exec(`INSERT INTO bill_occurrences(id,schedule_id,due_date,wallet_id,amount,name,note,category_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(schedule_id,due_date) DO NOTHING`, id(), a.ID, date, a.WalletID, a.Amount, a.Name, a.Note, a.CategoryID); e != nil {
				return e
			}
		}
		if _, e = tx.Exec(`UPDATE recurring_schedules SET next_index=? WHERE id=?`, index, a.ID); e != nil {
			return e
		}
	}
	return nil
}
func (s *Store) Due(ctx context.Context) ([]Bill, error) {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	if e = s.materialize(tx); e != nil {
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
	if e != nil {
		return nil, e
	}
	if e = tx.Commit(); e != nil {
		return nil, e
	}
	return out, nil
}
func bill(tx *sql.Tx, bid string) (Bill, error) {
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
	}{bid, in}, func(tx *sql.Tx) (Transaction, error) {
		var out Transaction
		b, e := bill(tx, bid)
		if e != nil {
			return out, e
		}
		if b.Status != "due" {
			return out, ErrConflict
		}
		if in.WalletID == "" {
			in.WalletID = b.WalletID
		}
		if in.Amount == "" {
			expected, err := wallet(tx, b.WalletID)
			if err != nil {
				return out, err
			}
			actual, err := wallet(tx, in.WalletID)
			if err != nil {
				return out, err
			}
			if expected.Currency != actual.Currency {
				return out, ErrInvalid
			}
			in.Amount = b.Amount
		}
		if in.Note == "" {
			in.Note = b.Note
		}
		in.Note = b.Name + ": " + in.Note
		out, e = s.createTransaction(tx, actor, TransactionInput{Kind: "expense", WalletID: in.WalletID, Amount: in.Amount, Date: in.Date, Note: in.Note, Rate: in.Rate, CategoryID: b.CategoryID})
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
	return write(ctx, s, actor, key, "schedule.update", in, func(tx *sql.Tx) (Schedule, error) {
		if e := s.materialize(tx); e != nil {
			return in, e
		}
		all, e := schedules(tx)
		if e != nil {
			return in, e
		}
		var old Schedule
		for _, a := range all {
			if a.ID == in.ID {
				old = a
				break
			}
		}
		if old.ID == "" {
			return in, ErrNotFound
		}
		if old.Version != in.Version {
			return in, ErrConflict
		}
		if in.StartDate != old.StartDate || in.Frequency != old.Frequency {
			return in, ErrInvalid
		}
		if e = validateSchedule(tx, in.ScheduleInput); e != nil {
			return in, e
		}
		in.Amount = FormatMoney(mustMoney(in.Amount))
		in.CategoryID, _ = categoryID(tx, "expense", in.CategoryID)
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
	return write(ctx, s, actor, key, "bill.skip", struct{ ID, Reason string }{bid, reason}, func(tx *sql.Tx) (Bill, error) {
		b, e := bill(tx, bid)
		if e != nil {
			return b, e
		}
		if b.Status != "due" {
			return b, ErrConflict
		}
		if strings.TrimSpace(reason) == "" || len(reason) > 500 {
			return b, ErrInvalid
		}
		old := b
		b.Status = "skipped"
		if _, e = tx.Exec(`UPDATE bill_occurrences SET status='skipped' WHERE id=?`, bid); e != nil {
			return b, e
		}
		return b, s.audit(tx, actor, bid, "skip", old, map[string]any{"bill": b, "reason": reason})
	})
}
