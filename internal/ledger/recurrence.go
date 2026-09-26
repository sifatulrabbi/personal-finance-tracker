package ledger

import (
	"sort"
	"strings"

	"simply-finance/internal/money"
)

// MaxScheduleBackfillDays bounds how far in the past a new schedule may start, which bounds the
// due bills its first read can create (53 for a weekly schedule).
const MaxScheduleBackfillDays = 366

// ScheduleFacts are the stored records a schedule names, loaded by the caller.
type ScheduleFacts struct {
	// CategoryFound reports whether ResolveCategory("expense", in.CategoryID) names a stored
	// expense category.
	CategoryFound bool
	Wallet        *Wallet // nil when missing
}

// ValidateSchedule checks a new schedule (previous nil) or an update to previous. earliest is the
// first start date a new schedule may have. An archived wallet is accepted only when an update
// keeps the wallet and does not turn the schedule back on, so a schedule on a closed account can
// still be edited or paused but never newly bills it.
func ValidateSchedule(in ScheduleInput, active bool, previous *Schedule, earliest string, f ScheduleFacts) error {
	if _, err := ResolveCategory("expense", in.CategoryID); err != nil {
		return err
	}
	if !f.CategoryFound {
		return CategoryMissing("expense")
	}
	if strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 {
		return Invalid("name", "Enter a name of at most 120 bytes.")
	}
	if len(in.Note) > 2000 {
		return Invalid("note", "Keep the note to at most 2,000 bytes.")
	}
	if in.Frequency != "weekly" && in.Frequency != "monthly" && in.Frequency != "yearly" {
		return Invalid("frequency", "Choose weekly, monthly, or yearly.")
	}
	if _, err := OccurrenceDate(in.StartDate, in.Frequency, 0); err != nil {
		return Invalid("start_date", "Enter a start date as YYYY-MM-DD.")
	}
	if previous == nil && in.StartDate < earliest {
		return Invalid("start_date", "Start the schedule no more than 366 days ago. Record older payments as expenses.")
	}
	if in.EndDate != "" && (!ValidDate(in.EndDate) || in.EndDate < in.StartDate) {
		return Invalid("end_date", "Enter an end date as YYYY-MM-DD, on or after the start date.")
	}
	n, err := money.ParseMoney(in.Amount)
	if err != nil || n <= 0 {
		return Invalid("amount", "Enter a positive amount with at most two decimal places.")
	}
	if f.Wallet == nil {
		return WalletNotFound("wallet_id", ErrNotFound)
	}
	kept := previous != nil && previous.WalletID == in.WalletID && (previous.Active || !active)
	if f.Wallet.Archived && !kept {
		return Archived("wallet_id", "This wallet is archived. Choose an active wallet for this bill.")
	}
	if f.Wallet.LegacyDebit() && (previous == nil || previous.WalletID != in.WalletID) {
		return Invalid("wallet_id", ErrLegacyDebit)
	}
	return nil
}

// CheckScheduleUpdate applies the rules an update must pass before its content is validated: the
// version must be current, and the start date and frequency cannot change.
func CheckScheduleUpdate(old, in Schedule) error {
	if old.Version != in.Version {
		return ErrStaleVersion
	}
	if in.StartDate != old.StartDate {
		return Invalid("start_date", "A schedule's start date cannot change.")
	}
	if in.Frequency != old.Frequency {
		return Invalid("frequency", "A schedule's frequency cannot change.")
	}
	return nil
}

// NormalizeSchedule is the stored form of a validated schedule input: the amount in canonical form
// and the category resolved.
func NormalizeSchedule(in ScheduleInput) ScheduleInput {
	in.Amount = money.FormatMoney(money.MustMoney(in.Amount))
	in.CategoryID, _ = ResolveCategory("expense", in.CategoryID)
	return in
}

// PaymentFacts are the wallets a bill payment names, loaded by the caller when the payment omits
// its amount (nil when missing).
type PaymentFacts struct {
	BillWallet, PaymentWallet *Wallet
}

// NeedsWallets reports whether BillPayment reads the wallets in PaymentFacts.
func (in PaymentInput) NeedsWallets() bool { return in.Amount == "" }

// PaymentWalletID is the wallet a payment of b is made from: the entered one, else the bill's.
func (in PaymentInput) PaymentWalletID(b Bill) string {
	if in.WalletID == "" {
		return b.WalletID
	}
	return in.WalletID
}

// BillPayment is the expense that confirms a due bill. An omitted wallet, date, or note uses the
// bill's; an omitted amount uses the scheduled amount, which is allowed only when the payment
// wallet has the bill's currency. The note is prefixed with the bill's name.
func BillPayment(b Bill, in PaymentInput, f PaymentFacts) (TransactionInput, error) {
	if b.Status != "due" {
		return TransactionInput{}, ErrAlreadySettled
	}
	in.WalletID = in.PaymentWalletID(b)
	if in.NeedsWallets() {
		if f.BillWallet == nil {
			return TransactionInput{}, ErrNotFound
		}
		if f.PaymentWallet == nil {
			return TransactionInput{}, WalletNotFound("wallet_id", ErrNotFound)
		}
		if f.BillWallet.Currency != f.PaymentWallet.Currency {
			return TransactionInput{}, Invalid("amount", "Enter the amount paid; the payment wallet uses a different currency from the bill.")
		}
		in.Amount = b.Amount
	}
	if in.Note == "" {
		in.Note = b.Note
	}
	if in.Date == "" {
		in.Date = b.DueDate
	}
	return TransactionInput{Kind: "expense", WalletID: in.WalletID, Amount: in.Amount, Date: in.Date, Note: b.Name + ": " + in.Note, Rate: in.Rate, CategoryID: b.CategoryID}, nil
}

// CheckSkip applies the rules for skipping a bill.
func CheckSkip(b Bill, reason string) error {
	if b.Status != "due" {
		return ErrAlreadySettled
	}
	if strings.TrimSpace(reason) == "" || len(reason) > 500 {
		return Invalid("reason", "Enter a reason of at most 500 bytes.")
	}
	return nil
}

// ScheduleState is a stored schedule with the index of its next occurrence not stored yet.
type ScheduleState struct {
	Schedule
	NextIndex int
}

// Pending computes the occurrences of active schedules that are not stored yet, dated on or before
// through, earliest first. Stored occurrences end at each schedule's NextIndex, so nothing repeats.
func Pending(all []ScheduleState, through string) []UpcomingBill {
	out := []UpcomingBill{}
	for _, a := range all {
		if !a.Active {
			continue
		}
		dates, _ := DueDates(a.Schedule, a.NextIndex, through)
		for _, date := range dates {
			out = append(out, UpcomingBill{ScheduleID: a.ID, DueDate: date, WalletID: a.WalletID, Amount: a.Amount, Name: a.Name, Note: a.Note, CategoryID: a.CategoryID})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].DueDate != out[j].DueDate {
			return out[i].DueDate < out[j].DueDate
		}
		return out[i].ScheduleID < out[j].ScheduleID
	})
	return out
}

// Upcoming limits pending occurrences to those dated after today, at most limit of them.
func Upcoming(pending []UpcomingBill, today string, limit int) []UpcomingBill {
	out := []UpcomingBill{}
	for _, b := range pending {
		if b.DueDate > today && len(out) < limit {
			out = append(out, b)
		}
	}
	return out
}

// SummarizeBills counts the bills due today or earlier, stored (dueCount, oldestDue) or not stored
// yet (in pending), and finds the next date after today.
func SummarizeBills(dueCount int, oldestDue string, pending []UpcomingBill, today string) BillSummary {
	out := BillSummary{DueCount: dueCount, OldestDueDate: oldestDue}
	for _, b := range pending {
		if b.DueDate <= today {
			out.DueCount++
			if out.OldestDueDate == "" || b.DueDate < out.OldestDueDate {
				out.OldestDueDate = b.DueDate
			}
		} else if out.NextDueDate == "" {
			out.NextDueDate = b.DueDate
		}
	}
	return out
}
