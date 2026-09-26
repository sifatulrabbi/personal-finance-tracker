package sqlite

import (
	"database/sql"
	"encoding/json"
	"errors"

	"simply-finance/internal/app"
	"simply-finance/internal/ledger"
	"simply-finance/internal/money"
)

type scanner interface{ Scan(dest ...any) error }

// requestKey prunes expired keys and looks up this one. It returns the stored response when the
// key was used for the same request, and ErrIdempotencyKeyReused when it was used for another.
func (tx records) requestKey(key app.RequestKey) ([]byte, error) {
	if _, e := tx.Exec(`DELETE FROM request_keys WHERE created_at<?`, key.ExpiresBefore); e != nil {
		return nil, e
	}
	var prior, body string
	e := tx.QueryRow(`SELECT fingerprint,response FROM request_keys WHERE actor_id=? AND key=?`, key.ActorID, key.Key).Scan(&prior, &body)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	if prior != key.Fingerprint {
		return nil, ledger.ErrIdempotencyKeyReused
	}
	return []byte(body), nil
}

// saveRequestKey stores a write's response under its key, so a retry replays it.
func (tx records) saveRequestKey(key app.RequestKey, result any) error {
	data, e := json.Marshal(result)
	if e != nil {
		return e
	}
	_, e = tx.Exec(`INSERT INTO request_keys(actor_id,key,fingerprint,response,created_at) VALUES(?,?,?,?,?)`, key.ActorID, key.Key, key.Fingerprint, string(data), key.CreatedAt)
	return e
}

// userExists refuses a write by an actor that is not a stored user.
func (tx records) userExists(id string) error {
	var exists int
	if e := tx.QueryRow(`SELECT count(*) FROM users WHERE id=?`, id).Scan(&exists); e != nil {
		return e
	}
	if exists == 0 {
		return ledger.ErrInvalid
	}
	return nil
}

// notFound turns a missing row into ledger.ErrNotFound.
func notFound(e error) error {
	if errors.Is(e, sql.ErrNoRows) {
		return ledger.ErrNotFound
	}
	return e
}

func (tx records) UserEmail(id string) (string, error) {
	var email string
	e := tx.QueryRow(`SELECT email FROM users WHERE id=?`, id).Scan(&email)
	return email, e
}

func (tx records) Audit(actor, entity, action string, before, after any, createdAt string) error {
	a, e := json.Marshal(before)
	if e != nil {
		return e
	}
	b, e := json.Marshal(after)
	if e != nil {
		return e
	}
	_, e = tx.Exec(`INSERT INTO audit_events(actor_id,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)`, actor, entity, action, string(a), string(b), createdAt)
	return e
}

// AuditEvents reads change-log events newest first, those before beforeID when it is not zero.
func (tx records) AuditEvents(beforeID int64, limit, offset int) ([]ledger.AuditEvent, error) {
	where, args := ``, []any{}
	if beforeID > 0 {
		where, args = `WHERE a.id<? `, append(args, beforeID)
	}
	rows, e := tx.Query(`SELECT a.id,u.email,a.entity_id,a.action,a.before_json,a.after_json,a.created_at FROM audit_events a JOIN users u ON u.id=a.actor_id `+where+`ORDER BY a.id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if e != nil {
		return nil, e
	}
	return collect(rows, func(row scanner) (ledger.AuditEvent, error) {
		var a ledger.AuditEvent
		var before, after string
		e := row.Scan(&a.ID, &a.ActorEmail, &a.EntityID, &a.Action, &before, &after, &a.CreatedAt)
		a.Before, a.After = json.RawMessage(before), json.RawMessage(after)
		return a, e
	})
}

// collect scans every row with scan and closes rows. It returns an empty, non-nil list when there
// are none, so an empty list is [] in JSON.
func collect[T any](rows *sql.Rows, scan func(scanner) (T, error)) ([]T, error) {
	defer rows.Close()
	out := []T{}
	for rows.Next() {
		v, e := scan(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	if e := rows.Err(); e != nil {
		return nil, e
	}
	return out, nil
}

const walletColumns = `id,name,type,card_type,currency,details,credit_limit,archived,version,balance_version,COALESCE(bank_wallet_id,''),balance_minor`

// scanWallet reads one row of walletColumns. The balance is the cached sum of the wallet's own
// entries (ADR 0012), so a linked debit card, which posts to its bank wallet, reports zero.
func scanWallet(row scanner) (ledger.Wallet, error) {
	var w ledger.Wallet
	var limit, balance int64
	if e := row.Scan(&w.ID, &w.Name, &w.Type, &w.CardType, &w.Currency, &w.Details, &limit, &w.Archived, &w.Version, &w.BalanceVersion, &w.BankWalletID, &balance); e != nil {
		return w, e
	}
	w.SetAmounts(limit, balance)
	return w, nil
}

func (tx records) Wallet(id string) (ledger.Wallet, error) {
	w, e := scanWallet(tx.QueryRow(`SELECT `+walletColumns+` FROM wallets WHERE id=?`, id))
	return w, notFound(e)
}

func (tx records) Wallets() ([]ledger.Wallet, error) {
	rows, e := tx.Query(`SELECT ` + walletColumns + ` FROM wallets ORDER BY name,id`)
	if e != nil {
		return nil, e
	}
	return collect(rows, scanWallet)
}

func (tx records) InsertWallet(id string, in ledger.WalletInput, creditLimit int64) error {
	var bank any
	if in.BankWalletID != "" {
		bank = in.BankWalletID
	}
	_, e := tx.Exec(`INSERT INTO wallets(id,name,type,card_type,currency,details,credit_limit,bank_wallet_id) VALUES(?,?,?,?,?,?,?,?)`, id, in.Name, in.Type, in.CardType, in.Currency, in.Details, creditLimit, bank)
	return e
}

func (tx records) UpdateWallet(id, name, details string, creditLimit int64, archived bool) error {
	_, e := tx.Exec(`UPDATE wallets SET name=?,details=?,credit_limit=?,archived=?,version=version+1 WHERE id=?`, name, details, creditLimit, archived, id)
	return e
}

// WalletBalance reads a wallet's cached balance, which the entry trigger keeps current.
func (tx records) WalletBalance(id string) (int64, error) {
	var balance int64
	e := tx.QueryRow(`SELECT balance_minor FROM wallets WHERE id=?`, id).Scan(&balance)
	return balance, e
}

// Settings reads the stored rate and version; the caller adds the fixed timezone and currency.
func (tx records) Settings() (ledger.Settings, error) {
	var out ledger.Settings
	var rate sql.NullInt64
	e := tx.QueryRow(`SELECT rate,version FROM settings WHERE id=1`).Scan(&rate, &out.Version)
	if rate.Valid {
		out.Rate = money.FormatRate(rate.Int64)
	}
	return out, e
}

func (tx records) SetRate(rate int64) error {
	_, e := tx.Exec(`UPDATE settings SET rate=?,version=version+1 WHERE id=1`, rate)
	return e
}

func (tx records) Categories() ([]ledger.Category, error) {
	rows, e := tx.Query(`SELECT id,type,name FROM categories ORDER BY type,name,id`)
	if e != nil {
		return nil, e
	}
	return collect(rows, func(row scanner) (ledger.Category, error) {
		var c ledger.Category
		e := row.Scan(&c.ID, &c.Type, &c.Name)
		return c, e
	})
}

// ExpenseCategories lists every expense category in display order, with no spending yet.
func (tx records) ExpenseCategories() ([]ledger.CategorySpending, error) {
	rows, e := tx.Query(`SELECT id,name FROM categories WHERE type='expense' ORDER BY name,id`)
	if e != nil {
		return nil, e
	}
	return collect(rows, func(row scanner) (ledger.CategorySpending, error) {
		var c ledger.CategorySpending
		e := row.Scan(&c.CategoryID, &c.Name)
		return c, e
	})
}

func (tx records) CategoryExists(id, kind string) (bool, error) {
	var count int
	e := tx.QueryRow(`SELECT count(*) FROM categories WHERE id=? AND type=?`, id, kind).Scan(&count)
	return count == 1, e
}

func (tx records) CategoryNameTaken(kind, name string) (bool, error) {
	var count int
	e := tx.QueryRow(`SELECT count(*) FROM categories WHERE type=? AND name=?`, kind, name).Scan(&count)
	return count != 0, e
}

func (tx records) InsertCategory(c ledger.Category) error {
	_, e := tx.Exec(`INSERT INTO categories(id,type,name) VALUES(?,?,?)`, c.ID, c.Type, c.Name)
	return e
}

// scheduleInput reads a stored schedule payload; a legacy schedule without a category is Others.
func scheduleInput(body string) (ledger.ScheduleInput, error) {
	var in ledger.ScheduleInput
	if e := json.Unmarshal([]byte(body), &in); e != nil {
		return in, e
	}
	if in.CategoryID == "" {
		in.CategoryID = "others-expense"
	}
	return in, nil
}

func (tx records) Schedules() ([]ledger.ScheduleState, error) {
	rows, e := tx.Query(`SELECT id,payload,version,active,next_index FROM recurring_schedules ORDER BY id`)
	if e != nil {
		return nil, e
	}
	return collect(rows, func(row scanner) (ledger.ScheduleState, error) {
		var a ledger.ScheduleState
		var body string
		if e := row.Scan(&a.ID, &body, &a.Version, &a.Active, &a.NextIndex); e != nil {
			return a, e
		}
		var e error
		a.ScheduleInput, e = scheduleInput(body)
		return a, e
	})
}

func (tx records) Schedule(id string) (ledger.Schedule, error) {
	var a ledger.Schedule
	var body string
	if e := tx.QueryRow(`SELECT id,payload,version,active FROM recurring_schedules WHERE id=?`, id).Scan(&a.ID, &body, &a.Version, &a.Active); e != nil {
		return a, notFound(e)
	}
	var e error
	a.ScheduleInput, e = scheduleInput(body)
	return a, e
}

func (tx records) InsertSchedule(id string, in ledger.ScheduleInput) error {
	body, e := json.Marshal(in)
	if e != nil {
		return e
	}
	_, e = tx.Exec(`INSERT INTO recurring_schedules(id,payload) VALUES(?,?)`, id, string(body))
	return e
}

func (tx records) UpdateSchedule(a ledger.Schedule) error {
	body, e := json.Marshal(a.ScheduleInput)
	if e != nil {
		return e
	}
	_, e = tx.Exec(`UPDATE recurring_schedules SET payload=?,version=?,active=? WHERE id=?`, string(body), a.Version, a.Active, a.ID)
	return e
}

func (tx records) SetNextIndex(id string, next int) error {
	_, e := tx.Exec(`UPDATE recurring_schedules SET next_index=? WHERE id=?`, next, id)
	return e
}

// InsertOccurrence stores a due occurrence unless its schedule already has one on that date.
func (tx records) InsertOccurrence(b ledger.Bill) error {
	_, e := tx.Exec(`INSERT INTO bill_occurrences(id,schedule_id,due_date,wallet_id,amount,name,note,category_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(schedule_id,due_date) DO NOTHING`, b.ID, b.ScheduleID, b.DueDate, b.WalletID, b.Amount, b.Name, b.Note, b.CategoryID)
	return e
}

const billColumns = `id,schedule_id,due_date,wallet_id,amount,name,note,status,COALESCE(transaction_id,''),category_id`

func scanBill(row scanner) (ledger.Bill, error) {
	var b ledger.Bill
	e := row.Scan(&b.ID, &b.ScheduleID, &b.DueDate, &b.WalletID, &b.Amount, &b.Name, &b.Note, &b.Status, &b.TransactionID, &b.CategoryID)
	return b, e
}

func (tx records) Bill(id string) (ledger.Bill, error) {
	b, e := scanBill(tx.QueryRow(`SELECT `+billColumns+` FROM bill_occurrences WHERE id=?`, id))
	return b, notFound(e)
}

func (tx records) DueBills() ([]ledger.Bill, error) {
	rows, e := tx.Query(`SELECT ` + billColumns + ` FROM bill_occurrences WHERE status='due' ORDER BY due_date,id`)
	if e != nil {
		return nil, e
	}
	return collect(rows, scanBill)
}

func (tx records) BillsByStatus(status string, newestFirst bool, limit, offset int) ([]ledger.Bill, error) {
	order := "due_date,id"
	if newestFirst {
		order = "due_date DESC,id"
	}
	rows, e := tx.Query(`SELECT `+billColumns+` FROM bill_occurrences WHERE status=? ORDER BY `+order+` LIMIT ? OFFSET ?`, status, limit, offset)
	if e != nil {
		return nil, e
	}
	return collect(rows, scanBill)
}

func (tx records) DueBillCount() (int, string, error) {
	var count int
	var oldest sql.NullString
	e := tx.QueryRow(`SELECT count(*),min(due_date) FROM bill_occurrences WHERE status='due'`).Scan(&count, &oldest)
	return count, oldest.String, e
}

func (tx records) BillPaidBy(transactionID string) (string, bool, error) {
	var id string
	e := tx.QueryRow(`SELECT id FROM bill_occurrences WHERE transaction_id=?`, transactionID).Scan(&id)
	if errors.Is(e, sql.ErrNoRows) {
		return "", false, nil
	}
	return id, e == nil, e
}

func (tx records) MarkBillPaid(id, transactionID string) error {
	_, e := tx.Exec(`UPDATE bill_occurrences SET status='paid',transaction_id=? WHERE id=?`, transactionID, id)
	return e
}

func (tx records) MarkBillSkipped(id string) error {
	_, e := tx.Exec(`UPDATE bill_occurrences SET status='skipped' WHERE id=?`, id)
	return e
}

// ReopenBill makes a paid bill due again when its payment is voided.
func (tx records) ReopenBill(id string) error {
	_, e := tx.Exec(`UPDATE bill_occurrences SET status='due',transaction_id=NULL WHERE id=?`, id)
	return e
}

// LatestTarget reads the latest saved target on or before month, or nil when there is none.
func (tx records) LatestTarget(month string) (*ledger.SavedTarget, error) {
	var saved ledger.SavedTarget
	var amount sql.NullInt64
	e := tx.QueryRow(`SELECT month,amount,version FROM monthly_targets WHERE month<=? ORDER BY month DESC LIMIT 1`, month).Scan(&saved.Month, &amount, &saved.Version)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	if amount.Valid {
		saved.Amount = &amount.Int64
	}
	return &saved, nil
}

func (tx records) SaveTarget(month string, amount int64, version int) error {
	_, e := tx.Exec(`INSERT INTO monthly_targets(month,amount,version) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET amount=excluded.amount,version=excluded.version`, month, amount, version)
	return e
}

// MonthExpenses reads the month's current, non-voided expenses from the typed columns (ADR 0012).
// Dates are validated YYYY-MM-DD strings, so the month is one lexical range.
func (tx records) MonthExpenses(month string) ([]ledger.Expense, error) {
	rows, e := tx.Query(`SELECT category_id,bdt_minor FROM transactions WHERE kind='expense' AND voided=0 AND date>=? AND date<=?`, month+"-01", month+"-31")
	if e != nil {
		return nil, e
	}
	return collect(rows, func(row scanner) (ledger.Expense, error) {
		var category sql.NullString
		var n sql.NullInt64
		e := row.Scan(&category, &n)
		return ledger.Expense{CategoryID: category.String, BDTMinor: n.Int64, HasBDT: n.Valid}, e
	})
}
