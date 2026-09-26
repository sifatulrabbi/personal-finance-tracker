package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math/big"
	"simply-finance/internal/money"
	"sort"
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
		return nil, invalid("status", "Choose due, paid, or skipped.")
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

// UpcomingBill is a future occurrence computed from an active schedule. It is not stored and has
// no id until it comes due.
type UpcomingBill struct {
	ScheduleID string `json:"schedule_id"`
	DueDate    string `json:"due_date"`
	WalletID   string `json:"wallet_id"`
	Amount     string `json:"amount"`
	Name       string `json:"name"`
	Note       string `json:"note"`
	CategoryID string `json:"category_id"`
}

const (
	MaxUpcomingDays  = 366
	MaxUpcomingBills = 200
)

// pending computes the occurrences of active schedules that are not stored yet, dated on or
// before through. Stored occurrences end at each schedule's next_index, so nothing is repeated.
func pending(tx dbtx, through string) ([]UpcomingBill, error) {
	all, e := schedules(tx)
	if e != nil {
		return nil, e
	}
	out := []UpcomingBill{}
	for _, a := range all {
		if !a.Active {
			continue
		}
		var index int
		if e = tx.QueryRow(`SELECT next_index FROM recurring_schedules WHERE id=?`, a.ID).Scan(&index); e != nil {
			return nil, e
		}
		for ; index <= 10000; index++ {
			date, e := OccurrenceDate(a.StartDate, a.Frequency, index)
			if e != nil || date > through || (a.EndDate != "" && date > a.EndDate) {
				break
			}
			out = append(out, UpcomingBill{ScheduleID: a.ID, DueDate: date, WalletID: a.WalletID, Amount: a.Amount, Name: a.Name, Note: a.Note, CategoryID: a.CategoryID})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].DueDate != out[j].DueDate {
			return out[i].DueDate < out[j].DueDate
		}
		return out[i].ScheduleID < out[j].ScheduleID
	})
	return out, nil
}

func (s *Store) addDays(days int) string {
	return s.now().In(dhaka).AddDate(0, 0, days).Format("2006-01-02")
}

// Upcoming lists occurrences dated after today (Asia/Dhaka) through today plus days, at most
// MaxUpcomingBills, earliest first. It reads only.
func (s *Store) Upcoming(ctx context.Context, days int) ([]UpcomingBill, error) {
	if days < 1 || days > MaxUpcomingDays {
		return nil, invalid("days", "Use a number of days from 1 to 366.")
	}
	through, today := s.addDays(days), s.today()
	return read(ctx, s, func(tx dbtx) ([]UpcomingBill, error) {
		all, e := pending(tx, through)
		if e != nil {
			return nil, e
		}
		out := []UpcomingBill{}
		for _, b := range all {
			if b.DueDate > today && len(out) < MaxUpcomingBills {
				out = append(out, b)
			}
		}
		return out, nil
	})
}

type CurrencyTotal struct {
	Currency        string `json:"currency"`
	Cash            string `json:"cash"`
	CardDebt        string `json:"card_debt"`
	AvailableCredit string `json:"available_credit"`
}
type MonthSummary struct {
	Month  string        `json:"month"`
	Spent  string        `json:"spent"`
	Target MonthlyTarget `json:"target"`
}
type BillSummary struct {
	DueCount      int    `json:"due_count"`
	OldestDueDate string `json:"oldest_due_date,omitempty"`
	NextDueDate   string `json:"next_due_date,omitempty"`
}

// Summary is the home screen in one read. See docs/api.md for each figure's definition.
type Summary struct {
	Today            string          `json:"today"`
	Totals           []CurrencyTotal `json:"totals"`
	Month            MonthSummary    `json:"month"`
	Bills            BillSummary     `json:"bills"`
	Recent           []Transaction   `json:"recent"`
	LegacyDebitCards int             `json:"legacy_debit_cards"`
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
	type sums struct{ cash, debt, available *big.Int }
	byCurrency := map[string]*sums{}
	for _, currency := range []string{"BDT", "USD"} {
		byCurrency[currency] = &sums{new(big.Int), new(big.Int), new(big.Int)}
	}
	for _, w := range all {
		t := byCurrency[w.Currency]
		switch {
		case w.CardType == "credit":
			t.debt.Add(t.debt, big.NewInt(money.MustMoney(w.Debt)))
			t.available.Add(t.available, big.NewInt(money.MustMoney(w.AvailableCredit)))
		case w.CardType == "debit" && !w.legacyDebit():
		default:
			if w.legacyDebit() {
				out.LegacyDebitCards++
			}
			t.cash.Add(t.cash, big.NewInt(money.MustMoney(w.Balance)))
		}
	}
	for _, currency := range []string{"BDT", "USD"} {
		t := byCurrency[currency]
		out.Totals = append(out.Totals, CurrencyTotal{currency, money.FormatHundredths(t.cash), money.FormatHundredths(t.debt), money.FormatHundredths(t.available)})
	}
	month, e := monthly(tx, today[:7])
	if e != nil {
		return out, e
	}
	out.Month = MonthSummary{month.Month, month.Spent, month.Target}
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
	out.OldestDueDate = oldest.String
	all, e := pending(tx, upcomingThrough)
	if e != nil {
		return out, e
	}
	for _, b := range all {
		if b.DueDate <= today {
			out.DueCount++
			if out.OldestDueDate == "" || b.DueDate < out.OldestDueDate {
				out.OldestDueDate = b.DueDate
			}
		} else if out.NextDueDate == "" {
			out.NextDueDate = b.DueDate
		}
	}
	return out, nil
}
