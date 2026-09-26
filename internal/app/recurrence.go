package app

import (
	"context"

	"simply-finance/internal/ledger"
)

// Bill list limits.
const (
	MaxUpcomingDays  = 366
	MaxUpcomingBills = 200
)

// scheduleFacts loads the records a schedule names.
func scheduleFacts(tx Tx, in ledger.ScheduleInput) (ledger.ScheduleFacts, error) {
	var f ledger.ScheduleFacts
	cid, _ := ledger.ResolveCategory("expense", in.CategoryID)
	var e error
	if f.CategoryFound, e = tx.CategoryExists(cid, "expense"); e != nil {
		return f, e
	}
	f.Wallet, e = findWallet(tx, in.WalletID)
	return f, e
}

func (s *Service) CreateSchedule(ctx context.Context, actor, key string, in ledger.ScheduleInput) (ledger.Schedule, error) {
	return write(ctx, s, actor, key, "schedule.create", in, func(tx Tx) (ledger.Schedule, error) {
		out := ledger.Schedule{ScheduleInput: in, ID: newID(), Version: 1, Active: true}
		f, e := scheduleFacts(tx, in)
		if e != nil {
			return out, e
		}
		if e = ledger.ValidateSchedule(in, true, nil, s.addDays(-ledger.MaxScheduleBackfillDays), f); e != nil {
			return out, e
		}
		out.ScheduleInput = ledger.NormalizeSchedule(in)
		if e = tx.InsertSchedule(out.ID, out.ScheduleInput); e != nil {
			return out, e
		}
		return out, tx.Audit(actor, out.ID, "create", nil, out, s.instant())
	})
}

func (s *Service) UpdateSchedule(ctx context.Context, actor, key string, in ledger.Schedule) (ledger.Schedule, error) {
	return write(ctx, s, actor, key, "schedule.update", in, func(tx Tx) (ledger.Schedule, error) {
		if e := s.materialize(tx); e != nil {
			return in, e
		}
		old, e := tx.Schedule(in.ID)
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
		if e = tx.UpdateSchedule(in); e != nil {
			return in, e
		}
		if !old.Active && in.Active {
			if e = s.boundCatchUp(tx, in); e != nil {
				return in, e
			}
		}
		return in, tx.Audit(actor, in.ID, "update", old, in, s.instant())
	})
}

func (s *Service) Schedules(ctx context.Context) ([]ledger.Schedule, error) {
	return read(ctx, s, func(tx Tx) ([]ledger.Schedule, error) {
		all, e := tx.Schedules()
		if e != nil {
			return nil, e
		}
		out := make([]ledger.Schedule, len(all))
		for i, a := range all {
			out[i] = a.Schedule
		}
		return out, nil
	})
}

// Schedule reads one recurring schedule.
func (s *Service) Schedule(ctx context.Context, sid string) (ledger.Schedule, error) {
	return read(ctx, s, func(tx Tx) (ledger.Schedule, error) { return tx.Schedule(sid) })
}

// boundCatchUp moves a reactivated schedule's next occurrence into the backfill window, so
// reactivation still catches up recent unpaid dates but never years of them in one read.
func (s *Service) boundCatchUp(tx Tx, in ledger.Schedule) error {
	all, e := tx.Schedules()
	if e != nil {
		return e
	}
	for _, a := range all {
		if a.ID != in.ID {
			continue
		}
		next := ledger.CatchUpFrom(a.Schedule, a.NextIndex, s.addDays(-ledger.MaxScheduleBackfillDays))
		if next == a.NextIndex {
			return nil
		}
		return tx.SetNextIndex(a.ID, next)
	}
	return nil
}

// materialize stores the occurrences of active schedules that have come due by today.
func (s *Service) materialize(tx Tx) error {
	all, e := tx.Schedules()
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
			b := ledger.Bill{ID: newID(), ScheduleID: a.ID, DueDate: date, WalletID: a.WalletID, Amount: a.Amount, Name: a.Name, Note: a.Note, CategoryID: a.CategoryID}
			if e = tx.InsertOccurrence(b); e != nil {
				return e
			}
		}
		if e = tx.SetNextIndex(a.ID, next); e != nil {
			return e
		}
	}
	return nil
}

// Due stores the occurrences that have come due, so it runs as a write, and lists the due ones.
func (s *Service) Due(ctx context.Context) ([]ledger.Bill, error) {
	return change(ctx, s, func(tx Tx) ([]ledger.Bill, error) {
		if e := s.materialize(tx); e != nil {
			return nil, e
		}
		return tx.DueBills()
	})
}

// Bills lists stored occurrences by status. Listing due bills first creates any occurrences that
// have come due, exactly as Due does, and lists them oldest first; paid and skipped bills are
// plain reads, newest first.
func (s *Service) Bills(ctx context.Context, status string, limit, offset int) ([]ledger.Bill, error) {
	if status == "" {
		status = "due"
	}
	switch status {
	case "due", "paid", "skipped":
	default:
		return nil, ledger.Invalid("status", "Choose due, paid, or skipped.")
	}
	if e := validPage(limit, offset); e != nil {
		return nil, e
	}
	if status != "due" {
		return read(ctx, s, func(tx Tx) ([]ledger.Bill, error) { return tx.BillsByStatus(status, true, limit, offset) })
	}
	// Listing due bills stores the ones that have come due, so it runs as a write.
	return change(ctx, s, func(tx Tx) ([]ledger.Bill, error) {
		if e := s.materialize(tx); e != nil {
			return nil, e
		}
		return tx.BillsByStatus(status, false, limit, offset)
	})
}

// pending computes the occurrences of active schedules that are not stored yet, dated on or
// before through.
func pending(tx Tx, through string) ([]ledger.UpcomingBill, error) {
	all, e := tx.Schedules()
	if e != nil {
		return nil, e
	}
	return ledger.Pending(all, through), nil
}

// Upcoming lists occurrences dated after today (Asia/Dhaka) through today plus days, at most
// MaxUpcomingBills, earliest first. It reads only.
func (s *Service) Upcoming(ctx context.Context, days int) ([]ledger.UpcomingBill, error) {
	if days < 1 || days > MaxUpcomingDays {
		return nil, ledger.Invalid("days", "Use a number of days from 1 to 366.")
	}
	through, today := s.addDays(days), s.today()
	return read(ctx, s, func(tx Tx) ([]ledger.UpcomingBill, error) {
		all, e := pending(tx, through)
		if e != nil {
			return nil, e
		}
		return ledger.Upcoming(all, today, MaxUpcomingBills), nil
	})
}

func (s *Service) ConfirmBill(ctx context.Context, actor, key, bid string, in ledger.PaymentInput) (ledger.Transaction, error) {
	return write(ctx, s, actor, key, "bill.confirm", struct {
		ID    string
		Input ledger.PaymentInput
	}{bid, in}, func(tx Tx) (ledger.Transaction, error) {
		b, e := tx.Bill(bid)
		if e != nil {
			return ledger.Transaction{}, e
		}
		var f ledger.PaymentFacts
		if b.Status == "due" && in.NeedsWallets() {
			if f.BillWallet, e = findWallet(tx, b.WalletID); e != nil {
				return ledger.Transaction{}, e
			}
			if f.PaymentWallet, e = findWallet(tx, in.PaymentWalletID(b)); e != nil {
				return ledger.Transaction{}, e
			}
		}
		payment, e := ledger.BillPayment(b, in, f)
		if e != nil {
			return ledger.Transaction{}, e
		}
		out, e := s.createTransaction(tx, actor, payment)
		if e != nil {
			return out, e
		}
		if e = tx.MarkBillPaid(bid, out.ID); e != nil {
			return out, e
		}
		return out, tx.Audit(actor, bid, "confirm", b, map[string]string{"transaction_id": out.ID}, s.instant())
	})
}

func (s *Service) SkipBill(ctx context.Context, actor, key, bid, reason string) (ledger.Bill, error) {
	return write(ctx, s, actor, key, "bill.skip", struct{ ID, Reason string }{bid, reason}, func(tx Tx) (ledger.Bill, error) {
		b, e := tx.Bill(bid)
		if e != nil {
			return b, e
		}
		if e = ledger.CheckSkip(b, reason); e != nil {
			return b, e
		}
		old := b
		b.Status = "skipped"
		if e = tx.MarkBillSkipped(bid); e != nil {
			return b, e
		}
		return b, tx.Audit(actor, bid, "skip", old, map[string]any{"bill": b, "reason": reason}, s.instant())
	})
}
