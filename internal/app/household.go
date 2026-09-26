package app

import (
	"context"

	"simply-finance/internal/ledger"
)

// settings reads the stored settings and the household's fixed calendar and currency.
func (s *Service) settings(tx Tx) (ledger.Settings, error) {
	out, e := tx.Settings()
	out.Timezone, out.DefaultCurrency = s.loc.String(), "BDT"
	return out, e
}

func (s *Service) Settings(ctx context.Context) (ledger.Settings, error) {
	return read(ctx, s, s.settings)
}

// SetRate changes the default BDT-per-USD rate. Records keep the rate they snapshotted.
func (s *Service) SetRate(ctx context.Context, actor, key, rate string, version int) (ledger.Settings, error) {
	return write(ctx, s, actor, key, "settings.rate", struct {
		Rate    string
		Version int
	}{rate, version}, func(tx Tx) (ledger.Settings, error) {
		old, e := s.settings(tx)
		if e != nil {
			return old, e
		}
		n, e := ledger.ParseRateChange(old, version, rate)
		if e != nil {
			return old, e
		}
		if e = tx.SetRate(n); e != nil {
			return old, e
		}
		out, e := s.settings(tx)
		if e != nil {
			return out, e
		}
		return out, tx.Audit(actor, "settings", "rate", old, out, s.instant())
	})
}

func (s *Service) Categories(ctx context.Context) ([]ledger.Category, error) {
	return read(ctx, s, func(tx Tx) ([]ledger.Category, error) { return tx.Categories() })
}

func (s *Service) CreateCategory(ctx context.Context, actor, key string, in ledger.CategoryInput) (ledger.Category, error) {
	return write(ctx, s, actor, key, "category.create", in, func(tx Tx) (ledger.Category, error) {
		out := ledger.Category{CategoryInput: in, ID: newID()}
		if e := ledger.ValidateCategory(in); e != nil {
			return out, e
		}
		taken, e := tx.CategoryNameTaken(in.Type, in.Name)
		if e != nil {
			return out, e
		}
		if taken {
			return out, ledger.ErrDuplicateName
		}
		if e = tx.InsertCategory(out); e != nil {
			return out, e
		}
		return out, tx.Audit(actor, out.ID, "category.create", nil, out, s.instant())
	})
}

// monthlyTarget reads without writing: the month's own target, else the latest earlier one.
func monthlyTarget(tx Tx, month string) (ledger.MonthlyTarget, error) {
	latest, e := tx.LatestTarget(month)
	if e != nil {
		return ledger.MonthlyTarget{Version: 1}, e
	}
	return ledger.TargetFor(month, latest), nil
}

func (s *Service) SetMonthlyTarget(ctx context.Context, actor, key, month, amount string, version int) (ledger.MonthlyTarget, error) {
	return write(ctx, s, actor, key, "monthly.target", struct {
		Month, Amount string
		Version       int
	}{month, amount, version}, func(tx Tx) (ledger.MonthlyTarget, error) {
		n, e := ledger.ParseTarget(month, amount)
		if e != nil {
			return ledger.MonthlyTarget{}, e
		}
		old, e := monthlyTarget(tx, month)
		if e != nil {
			return old, e
		}
		out, e := ledger.SetTarget(old, version, n)
		if e != nil {
			return old, e
		}
		if e = tx.SaveTarget(month, n, out.Version); e != nil {
			return old, e
		}
		return out, tx.Audit(actor, month, "monthly.target", old, out, s.instant())
	})
}

// Monthly reads a month's spending, category shares, and target. An empty month is the current
// Asia/Dhaka month.
func (s *Service) Monthly(ctx context.Context, month string) (ledger.MonthlySpending, error) {
	if month == "" {
		month = s.today()[:7]
	}
	if !ledger.ValidMonth(month) {
		return ledger.MonthlySpending{Month: month, Categories: []ledger.CategorySpending{}}, ledger.ErrMonth
	}
	return read(ctx, s, func(tx Tx) (ledger.MonthlySpending, error) { return monthly(tx, month) })
}

// monthly sums the month's current, non-voided expenses at their saved BDT values.
func monthly(tx Tx, month string) (ledger.MonthlySpending, error) {
	out := ledger.MonthlySpending{Month: month, Categories: []ledger.CategorySpending{}}
	var e error
	if out.Target, e = monthlyTarget(tx, month); e != nil {
		return out, e
	}
	categories, e := tx.ExpenseCategories()
	if e != nil {
		return out, e
	}
	expenses, e := tx.MonthExpenses(month)
	if e != nil {
		return out, e
	}
	spent, shares, e := ledger.SumMonth(month, categories, expenses)
	if e != nil {
		return out, e
	}
	out.Spent, out.Categories = spent, shares
	return out, nil
}

const summaryUpcomingDays = 90

// Summary is the home screen in one read snapshot, so the totals, spending, and recent records
// agree. It never writes: bills that have come due but are not stored yet count as due.
func (s *Service) Summary(ctx context.Context) (ledger.Summary, error) {
	today, through := s.today(), s.addDays(summaryUpcomingDays)
	return read(ctx, s, func(tx Tx) (ledger.Summary, error) {
		out := ledger.Summary{Today: today}
		all, e := tx.Wallets()
		if e != nil {
			return out, e
		}
		out.Totals, out.LegacyDebitCards = ledger.Totals(all)
		month, e := monthly(tx, today[:7])
		if e != nil {
			return out, e
		}
		out.Month = ledger.MonthSummary{Month: month.Month, Spent: month.Spent, Target: month.Target}
		count, oldest, e := tx.DueBillCount()
		if e != nil {
			return out, e
		}
		upcoming, e := pending(tx, through)
		if e != nil {
			return out, e
		}
		out.Bills = ledger.SummarizeBills(count, oldest, upcoming, today)
		out.Recent, e = tx.RecentTransactions(5, 0)
		return out, e
	})
}
