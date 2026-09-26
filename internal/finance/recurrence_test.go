package finance_test

import (
	"errors"
	"path/filepath"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

func archiveWallet(t *testing.T, s *finance.Store, u finance.User, wid string) {
	t.Helper()
	ws, e := s.Wallets(ctx)
	if e != nil {
		t.Fatal(e)
	}
	for _, w := range ws {
		if w.ID == wid {
			w.Archived = true
			if _, e = s.UpdateWallet(ctx, u.ID, "archive-"+wid, w); e != nil {
				t.Fatal(e)
			}
			return
		}
	}
	t.Fatalf("wallet %s not found", wid)
}

// Regression (C1): archiving a wallet must not trap its schedules; only pointing a schedule at an
// archived wallet, or turning one back on there, is refused.
func TestScheduleOnArchivedWalletCanBeDeactivatedButNotRetargeted(t *testing.T) {
	today := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "archived-schedule.sqlite"), func() time.Time { return today })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	u := user(t, s)
	closed := createWallet(t, s, u, "closed", "BDT", "", "5000")
	open := createWallet(t, s, u, "open", "BDT", "", "5000")
	rent, e := s.CreateSchedule(ctx, u.ID, "rent", finance.ScheduleInput{Name: "Rent", WalletID: closed.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	water, e := s.CreateSchedule(ctx, u.ID, "water", finance.ScheduleInput{Name: "Water", WalletID: open.ID, Amount: "300", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	archiveWallet(t, s, u, closed.ID)
	if _, e = s.CreateSchedule(ctx, u.ID, "new-on-closed", finance.ScheduleInput{Name: "Gym", WalletID: closed.ID, Amount: "10", StartDate: "2026-09-01", Frequency: "monthly"}); !errors.Is(e, finance.ErrArchivedWallet) {
		t.Fatalf("create on archived: %v", e)
	}
	water.WalletID = closed.ID
	if _, e = s.UpdateSchedule(ctx, u.ID, "move-water", water); !errors.Is(e, finance.ErrArchivedWallet) {
		t.Fatalf("move onto archived: %v", e)
	}
	rent.Note = "Old flat"
	if rent, e = s.UpdateSchedule(ctx, u.ID, "note-rent", rent); e != nil {
		t.Fatalf("edit with unchanged archived wallet: %v", e)
	}
	rent.Active = false
	if rent, e = s.UpdateSchedule(ctx, u.ID, "pause-rent", rent); e != nil || rent.Active {
		t.Fatalf("deactivate: %+v %v", rent, e)
	}
	rent.Active = true
	if _, e = s.UpdateSchedule(ctx, u.ID, "resume-rent", rent); !errors.Is(e, finance.ErrArchivedWallet) {
		t.Fatalf("reactivate on archived: %v", e)
	}
	today = time.Date(2026, 12, 14, 12, 0, 0, 0, time.UTC)
	due, e := s.Due(ctx)
	if e != nil {
		t.Fatal(e)
	}
	rentBills := 0
	for _, b := range due {
		if b.ScheduleID == rent.ID {
			rentBills++
		}
	}
	if rentBills != 1 || len(due) != 5 {
		t.Fatalf("deactivated schedule kept generating bills: rent=%d all=%+v", rentBills, due)
	}
}

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
	if _, e = s.ConfirmBill(ctx, u.ID, "double-pay", due[0].ID, finance.PaymentInput{Date: "2026-09-14"}); !errors.Is(e, finance.ErrAlreadySettled) {
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
	if _, e = s.ConfirmBill(ctx, u.ID, "zero", due[0].ID, finance.PaymentInput{Amount: "0", Date: "2026-09-14"}); !errors.Is(e, finance.ErrInvalid) {
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
	if !errors.Is(err, finance.ErrInvalid) {
		t.Fatalf("blank amount switched currencies: %v", err)
	}
	paid, err := s.ConfirmBill(ctx, u.ID, "actual-usd", due[0].ID, finance.PaymentInput{WalletID: usd.ID, Amount: "8", Date: "2026-09-14", Rate: "125"})
	if err != nil || paid.Amount != "8.00" {
		t.Fatalf("explicit USD: %+v %v", paid, err)
	}
}
