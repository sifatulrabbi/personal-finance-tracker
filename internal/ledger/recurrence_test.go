package ledger_test

import (
	"errors"
	"reflect"
	"testing"

	"simply-finance/internal/ledger"
)

func TestValidateSchedule(t *testing.T) {
	ok := ledger.ScheduleFacts{CategoryFound: true, Wallet: ptr(bankBDT)}
	base := ledger.ScheduleInput{Name: "Rent", WalletID: "bank", Amount: "100", StartDate: "2026-09-01", Frequency: "monthly"}
	active := &ledger.Schedule{ScheduleInput: base, Active: true}
	paused := &ledger.Schedule{ScheduleInput: base, Active: false}
	onArchived := ledger.ScheduleFacts{CategoryFound: true, Wallet: ptr(archived)}
	for name, tc := range map[string]struct {
		change      func(*ledger.ScheduleInput)
		active      bool
		previous    *ledger.Schedule
		facts       ledger.ScheduleFacts
		code, field string
	}{
		"valid":                    {nil, true, nil, ok, "", ""},
		"missing category":         {nil, true, nil, ledger.ScheduleFacts{Wallet: ptr(bankBDT)}, "validation_failed", "category_id"},
		"blank name":               {func(in *ledger.ScheduleInput) { in.Name = "" }, true, nil, ok, "validation_failed", "name"},
		"long note":                {func(in *ledger.ScheduleInput) { in.Note = string(make([]byte, 2001)) }, true, nil, ok, "validation_failed", "note"},
		"daily":                    {func(in *ledger.ScheduleInput) { in.Frequency = "daily" }, true, nil, ok, "validation_failed", "frequency"},
		"bad start":                {func(in *ledger.ScheduleInput) { in.StartDate = "2026-02-30" }, true, nil, ok, "validation_failed", "start_date"},
		"too far back":             {func(in *ledger.ScheduleInput) { in.StartDate = "2025-09-12" }, true, nil, ok, "validation_failed", "start_date"},
		"old start on update":      {func(in *ledger.ScheduleInput) { in.StartDate = "2020-01-01" }, true, &ledger.Schedule{ScheduleInput: base, Active: true}, ok, "", ""},
		"end before start":         {func(in *ledger.ScheduleInput) { in.EndDate = "2026-08-31" }, true, nil, ok, "validation_failed", "end_date"},
		"zero amount":              {func(in *ledger.ScheduleInput) { in.Amount = "0" }, true, nil, ok, "validation_failed", "amount"},
		"missing wallet":           {nil, true, nil, ledger.ScheduleFacts{CategoryFound: true}, "not_found", "wallet_id"},
		"new on archived":          {nil, true, nil, onArchived, "archived_wallet", "wallet_id"},
		"edit kept on archived":    {nil, true, active, onArchived, "", ""},
		"pause kept on archived":   {nil, false, active, onArchived, "", ""},
		"resume on archived":       {nil, true, paused, onArchived, "archived_wallet", "wallet_id"},
		"new on a legacy card":     {nil, true, nil, ledger.ScheduleFacts{CategoryFound: true, Wallet: ptr(legacy)}, "validation_failed", "wallet_id"},
		"legacy card kept on edit": {func(in *ledger.ScheduleInput) { in.WalletID = "legacy" }, true, &ledger.Schedule{ScheduleInput: ledger.ScheduleInput{WalletID: "legacy"}, Active: true}, ledger.ScheduleFacts{CategoryFound: true, Wallet: ptr(legacy)}, "", ""},
	} {
		in := base
		if tc.change != nil {
			tc.change(&in)
		}
		e := ledger.ValidateSchedule(in, tc.active, tc.previous, "2025-09-13", tc.facts)
		if code, field := fieldOf(e); code != tc.code || field != tc.field {
			t.Errorf("%s: %s/%s %v", name, code, field, e)
		}
	}
	n := ledger.NormalizeSchedule(ledger.ScheduleInput{Amount: "5"})
	if n.Amount != "5.00" || n.CategoryID != "others-expense" {
		t.Fatalf("normalize: %+v", n)
	}
}

func TestCheckScheduleUpdate(t *testing.T) {
	old := ledger.Schedule{ScheduleInput: ledger.ScheduleInput{StartDate: "2026-09-01", Frequency: "monthly"}, Version: 2}
	for name, tc := range map[string]struct {
		in   ledger.Schedule
		code string
	}{
		"same":      {old, ""},
		"stale":     {ledger.Schedule{ScheduleInput: old.ScheduleInput, Version: 1}, "stale_version"},
		"start":     {ledger.Schedule{ScheduleInput: ledger.ScheduleInput{StartDate: "2026-09-02", Frequency: "monthly"}, Version: 2}, "validation_failed"},
		"frequency": {ledger.Schedule{ScheduleInput: ledger.ScheduleInput{StartDate: "2026-09-01", Frequency: "weekly"}, Version: 2}, "validation_failed"},
	} {
		if code, _ := fieldOf(ledger.CheckScheduleUpdate(old, tc.in)); code != tc.code {
			t.Errorf("%s: %s", name, code)
		}
	}
}

func TestBillPaymentDefaults(t *testing.T) {
	b := ledger.Bill{ID: "b", WalletID: "bank", Amount: "1000.00", DueDate: "2026-09-01", Name: "Rent", Note: "September", Status: "due", CategoryID: "housing"}
	got, e := ledger.BillPayment(b, ledger.PaymentInput{}, ledger.PaymentFacts{BillWallet: ptr(bankBDT), PaymentWallet: ptr(bankBDT)})
	want := ledger.TransactionInput{Kind: "expense", WalletID: "bank", Amount: "1000.00", Date: "2026-09-01", Note: "Rent: September", CategoryID: "housing"}
	if e != nil || got != want {
		t.Fatalf("omitted fields use the bill: %+v %v", got, e)
	}
	got, e = ledger.BillPayment(b, ledger.PaymentInput{Amount: "1010", WalletID: "usd", Date: "2026-09-03", Note: "late fee", Rate: "120"}, ledger.PaymentFacts{})
	if e != nil || got.Amount != "1010" || got.WalletID != "usd" || got.Note != "Rent: late fee" || got.Rate != "120" {
		t.Fatalf("entered fields win and no wallets are needed: %+v %v", got, e)
	}
	if in := (ledger.PaymentInput{}); in.PaymentWalletID(b) != "bank" || !in.NeedsWallets() {
		t.Fatal("payment wallet defaults to the bill's")
	}
	for name, tc := range map[string]struct {
		b           ledger.Bill
		in          ledger.PaymentInput
		f           ledger.PaymentFacts
		code, field string
	}{
		"paid":                {ledger.Bill{Status: "paid"}, ledger.PaymentInput{}, ledger.PaymentFacts{}, "already_settled", ""},
		"bill wallet gone":    {b, ledger.PaymentInput{}, ledger.PaymentFacts{PaymentWallet: ptr(bankBDT)}, "not_found", ""},
		"payment wallet gone": {b, ledger.PaymentInput{WalletID: "gone"}, ledger.PaymentFacts{BillWallet: ptr(bankBDT)}, "not_found", "wallet_id"},
		"other currency":      {b, ledger.PaymentInput{WalletID: "usd"}, ledger.PaymentFacts{BillWallet: ptr(bankBDT), PaymentWallet: ptr(bankUSD)}, "validation_failed", "amount"},
	} {
		_, e := ledger.BillPayment(tc.b, tc.in, tc.f)
		if code, field := fieldOf(e); code != tc.code || field != tc.field {
			t.Errorf("%s: %s/%s", name, code, field)
		}
	}
	if !errors.Is(ledger.CheckSkip(ledger.Bill{Status: "skipped"}, "x"), ledger.ErrAlreadySettled) || ledger.CheckSkip(b, "") == nil || ledger.CheckSkip(b, "moved out") != nil {
		t.Fatal("skip rules")
	}
}

func TestPendingUpcomingAndBillSummary(t *testing.T) {
	weekly := ledger.ScheduleState{Schedule: ledger.Schedule{ID: "w", Active: true, ScheduleInput: ledger.ScheduleInput{StartDate: "2026-09-01", Frequency: "weekly", Amount: "5.00"}}, NextIndex: 2}
	monthly := ledger.ScheduleState{Schedule: ledger.Schedule{ID: "m", Active: true, ScheduleInput: ledger.ScheduleInput{StartDate: "2026-09-15", Frequency: "monthly"}}}
	paused := ledger.ScheduleState{Schedule: ledger.Schedule{ID: "p", ScheduleInput: ledger.ScheduleInput{StartDate: "2026-09-01", Frequency: "weekly"}}}
	pending := ledger.Pending([]ledger.ScheduleState{monthly, weekly, paused}, "2026-09-22")
	dates := []string{}
	for _, b := range pending {
		dates = append(dates, b.ScheduleID+" "+b.DueDate)
	}
	if !reflect.DeepEqual(dates, []string{"m 2026-09-15", "w 2026-09-15", "w 2026-09-22"}) {
		t.Fatalf("earliest first, then by schedule; stored ones skipped: %v", dates)
	}
	if pending[1].Amount != "5.00" {
		t.Fatalf("copies the schedule: %+v", pending[1])
	}
	upcoming := ledger.Upcoming(pending, "2026-09-15", 200)
	if len(upcoming) != 1 || upcoming[0].DueDate != "2026-09-22" {
		t.Fatalf("after today only: %+v", upcoming)
	}
	if got := ledger.Upcoming(pending, "2026-09-01", 2); len(got) != 2 {
		t.Fatalf("limit: %+v", got)
	}
	s := ledger.SummarizeBills(1, "2026-09-10", pending, "2026-09-15")
	if s != (ledger.BillSummary{DueCount: 3, OldestDueDate: "2026-09-10", NextDueDate: "2026-09-22"}) {
		t.Fatalf("summary: %+v", s)
	}
	s = ledger.SummarizeBills(0, "", pending, "2026-09-15")
	if s.OldestDueDate != "2026-09-15" || s.DueCount != 2 {
		t.Fatalf("pending bills count as due: %+v", s)
	}
}
