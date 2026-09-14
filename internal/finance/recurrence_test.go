package finance_test

import (
	"simply-finance/internal/finance"
	"testing"
)

func TestRecurrencePreservesAnchorAcrossShortMonths(t *testing.T) {
	for _, tc := range []struct {
		start, frequency string
		n                int
		want             string
	}{{"2026-01-31", "monthly", 1, "2026-02-28"}, {"2026-01-31", "monthly", 2, "2026-03-31"}, {"2024-02-29", "yearly", 1, "2025-02-28"}, {"2024-02-29", "yearly", 4, "2028-02-29"}, {"2026-09-14", "weekly", 1, "2026-09-21"}} {
		got, e := finance.OccurrenceDate(tc.start, tc.frequency, tc.n)
		if e != nil || got != tc.want {
			t.Fatalf("%+v: %s %v", tc, got, e)
		}
	}
	if _, e := finance.OccurrenceDate("2026-02-30", "monthly", 1); e == nil {
		t.Fatal("invalid date accepted")
	}
}
func TestRecurringBillOnlyChangesBalanceOnManualConfirmation(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "cash", "BDT", "", "5000")
	schedule, e := s.CreateSchedule(ctx, u.ID, "wifi", finance.ScheduleInput{Name: "Wi-Fi", WalletID: w.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	due, e := s.Due(ctx)
	if e != nil || len(due) != 1 || due[0].ScheduleID != schedule.ID {
		t.Fatalf("due: %+v %v", due, e)
	}
	ws, _ := s.Wallets(ctx)
	if ws[0].Balance != "5000.00" {
		t.Fatal("due bill changed balance")
	}
	r, e := s.ConfirmBill(ctx, u.ID, "pay-wifi", due[0].ID, finance.PaymentInput{Date: "2026-09-14", Note: "Paid cash"})
	if e != nil || r.Amount != "1000.00" {
		t.Fatalf("payment: %+v %v", r, e)
	}
	again, e := s.ConfirmBill(ctx, u.ID, "pay-wifi", due[0].ID, finance.PaymentInput{Date: "2026-09-14", Note: "Paid cash"})
	if e != nil || again.ID != r.ID {
		t.Fatalf("retry %+v %v", again, e)
	}
	if _, e = s.ConfirmBill(ctx, u.ID, "double-pay", due[0].ID, finance.PaymentInput{Date: "2026-09-14"}); e != finance.ErrConflict {
		t.Fatalf("duplicate: %v", e)
	}
	due, e = s.Due(ctx)
	if e != nil || len(due) != 0 {
		t.Fatalf("paid due: %+v %v", due, e)
	}
	ws, _ = s.Wallets(ctx)
	if ws[0].Balance != "4000.00" {
		t.Fatal(ws)
	}
}
func TestActualBillAmountAndVoidReopenTheDueItem(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "bank", "BDT", "", "5000")
	_, e := s.CreateSchedule(ctx, u.ID, "rent", finance.ScheduleInput{Name: "Rent", WalletID: w.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	due, _ := s.Due(ctx)
	if _, e = s.ConfirmBill(ctx, u.ID, "zero", due[0].ID, finance.PaymentInput{Amount: "0", Date: "2026-09-14"}); e != finance.ErrInvalid {
		t.Fatalf("zero %v", e)
	}
	r, e := s.ConfirmBill(ctx, u.ID, "actual", due[0].ID, finance.PaymentInput{Amount: "1020", Date: "2026-09-14", Note: "Includes card charge"})
	if e != nil || r.Amount != "1020.00" {
		t.Fatalf("actual: %+v %v", r, e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "void-bill", r.ID, 1, finance.TransactionInput{Reason: "Wrong payment"}, true); e != nil {
		t.Fatal(e)
	}
	due, e = s.Due(ctx)
	if e != nil || len(due) != 1 {
		t.Fatalf("void should reopen due: %+v %v", due, e)
	}
}
func TestScheduleEditsPreserveAlreadyDueAmountsAndSkipIsAudited(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "cash", "BDT", "", "5000")
	a, e := s.CreateSchedule(ctx, u.ID, "wifi", finance.ScheduleInput{Name: "Wi-Fi", WalletID: w.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	a.Amount = "1100"
	a.Active = false
	if _, e = s.UpdateSchedule(ctx, u.ID, "update-wifi", a); e != nil {
		t.Fatal(e)
	}
	due, e := s.Due(ctx)
	if e != nil || len(due) != 1 || due[0].Amount != "1000.00" {
		t.Fatalf("snapshot: %+v %v", due, e)
	}
	if _, e = s.SkipBill(ctx, u.ID, "skip", due[0].ID, "Not owed this month"); e != nil {
		t.Fatal(e)
	}
	due, e = s.Due(ctx)
	if e != nil || len(due) != 0 {
		t.Fatalf("skip: %+v %v", due, e)
	}
	ws, _ := s.Wallets(ctx)
	if ws[0].Balance != "5000.00" {
		t.Fatal(ws)
	}
}

func TestBillCannotSilentlyReinterpretBDTAsUSD(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	bdt := createWallet(t, s, u, "BDT", "BDT", "", "10000")
	usd := createWallet(t, s, u, "USD", "USD", "", "100")
	_, err := s.CreateSchedule(ctx, u.ID, "wifi", finance.ScheduleInput{Name: "Wi-Fi", WalletID: bdt.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if err != nil {
		t.Fatal(err)
	}
	due, err := s.Due(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.ConfirmBill(ctx, u.ID, "wrong-currency", due[0].ID, finance.PaymentInput{WalletID: usd.ID, Date: "2026-09-14", Rate: "125"})
	if err != finance.ErrInvalid {
		t.Fatalf("blank amount switched currencies: %v", err)
	}
	paid, err := s.ConfirmBill(ctx, u.ID, "actual-usd", due[0].ID, finance.PaymentInput{WalletID: usd.ID, Amount: "8", Date: "2026-09-14", Rate: "125"})
	if err != nil || paid.Amount != "8.00" {
		t.Fatalf("explicit USD: %+v %v", paid, err)
	}
}
