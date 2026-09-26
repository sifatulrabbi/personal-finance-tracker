package app_test

import (
	"errors"
	"path/filepath"
	"simply-finance/internal/apptest"
	"simply-finance/internal/ledger"
	"testing"
	"time"
)

func archiveWallet(t *testing.T, s *apptest.Household, u ledger.User, wid string) {
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
	rent, e := s.CreateSchedule(ctx, u.ID, "rent", ledger.ScheduleInput{Name: "Rent", WalletID: closed.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	water, e := s.CreateSchedule(ctx, u.ID, "water", ledger.ScheduleInput{Name: "Water", WalletID: open.ID, Amount: "300", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	archiveWallet(t, s, u, closed.ID)
	if _, e = s.CreateSchedule(ctx, u.ID, "new-on-closed", ledger.ScheduleInput{Name: "Gym", WalletID: closed.ID, Amount: "10", StartDate: "2026-09-01", Frequency: "monthly"}); !errors.Is(e, ledger.ErrArchivedWallet) {
		t.Fatalf("create on archived: %v", e)
	}
	water.WalletID = closed.ID
	if _, e = s.UpdateSchedule(ctx, u.ID, "move-water", water); !errors.Is(e, ledger.ErrArchivedWallet) {
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
	if _, e = s.UpdateSchedule(ctx, u.ID, "resume-rent", rent); !errors.Is(e, ledger.ErrArchivedWallet) {
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

// Regression: reactivating a long-paused schedule used to create every missed occurrence since it
// was paused, in one GET /bills/due on the single writer. Catch-up is bounded like a new schedule.
func TestReactivationCatchesUpAtMostTheBackfillWindow(t *testing.T) {
	today := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "reactivate.sqlite"), func() time.Time { return today })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	u := user(t, s)
	cash := createWallet(t, s, u, "cash", "BDT", "", "5000")
	gym, e := s.CreateSchedule(ctx, u.ID, "gym", ledger.ScheduleInput{Name: "Gym", WalletID: cash.ID, Amount: "100", StartDate: "2026-09-07", Frequency: "weekly"})
	if e != nil {
		t.Fatal(e)
	}
	gym.Active = false
	if gym, e = s.UpdateSchedule(ctx, u.ID, "pause", gym); e != nil {
		t.Fatal(e)
	}
	today = time.Date(2029, 9, 14, 12, 0, 0, 0, time.UTC)
	gym.Active = true
	if _, e = s.UpdateSchedule(ctx, u.ID, "resume", gym); e != nil {
		t.Fatal(e)
	}
	due, e := s.Due(ctx)
	if e != nil {
		t.Fatal(e)
	}
	earliest := "2028-09-13"
	missed := 0
	for _, b := range due {
		if b.ScheduleID != gym.ID || b.DueDate <= "2026-09-14" {
			continue
		}
		missed++
		if b.DueDate < earliest {
			t.Fatalf("bill from before the window: %s", b.DueDate)
		}
	}
	if missed < 52 || missed > 53 {
		t.Fatalf("want about a year of weekly bills after reactivation, got %d", missed)
	}
}

func TestRecurringBillOnlyChangesBalanceOnManualConfirmation(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "cash", "BDT", "", "5000")
	schedule, e := s.CreateSchedule(ctx, u.ID, "wifi", ledger.ScheduleInput{Name: "Wi-Fi", WalletID: w.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
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
	r, e := s.ConfirmBill(ctx, u.ID, "pay-wifi", due[0].ID, ledger.PaymentInput{Date: "2026-09-14", Note: "Paid cash"})
	if e != nil || r.Amount != "1000.00" {
		t.Fatalf("payment: %+v %v", r, e)
	}
	again, e := s.ConfirmBill(ctx, u.ID, "pay-wifi", due[0].ID, ledger.PaymentInput{Date: "2026-09-14", Note: "Paid cash"})
	if e != nil || again.ID != r.ID {
		t.Fatalf("retry %+v %v", again, e)
	}
	if _, e = s.ConfirmBill(ctx, u.ID, "double-pay", due[0].ID, ledger.PaymentInput{Date: "2026-09-14"}); !errors.Is(e, ledger.ErrAlreadySettled) {
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
	_, e := s.CreateSchedule(ctx, u.ID, "rent", ledger.ScheduleInput{Name: "Rent", WalletID: w.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if e != nil {
		t.Fatal(e)
	}
	due, _ := s.Due(ctx)
	if _, e = s.ConfirmBill(ctx, u.ID, "zero", due[0].ID, ledger.PaymentInput{Amount: "0", Date: "2026-09-14"}); !errors.Is(e, ledger.ErrInvalid) {
		t.Fatalf("zero %v", e)
	}
	r, e := s.ConfirmBill(ctx, u.ID, "actual", due[0].ID, ledger.PaymentInput{Amount: "1020", Date: "2026-09-14", Note: "Includes card charge"})
	if e != nil || r.Amount != "1020.00" {
		t.Fatalf("actual: %+v %v", r, e)
	}
	if _, e = s.ReviseTransaction(ctx, u.ID, "void-bill", r.ID, 1, ledger.TransactionInput{Reason: "Wrong payment"}, true); e != nil {
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
	a, e := s.CreateSchedule(ctx, u.ID, "wifi", ledger.ScheduleInput{Name: "Wi-Fi", WalletID: w.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
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
	_, err := s.CreateSchedule(ctx, u.ID, "wifi", ledger.ScheduleInput{Name: "Wi-Fi", WalletID: bdt.ID, Amount: "1000", StartDate: "2026-09-01", Frequency: "monthly"})
	if err != nil {
		t.Fatal(err)
	}
	due, err := s.Due(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.ConfirmBill(ctx, u.ID, "wrong-currency", due[0].ID, ledger.PaymentInput{WalletID: usd.ID, Date: "2026-09-14", Rate: "125"})
	if !errors.Is(err, ledger.ErrInvalid) {
		t.Fatalf("blank amount switched currencies: %v", err)
	}
	paid, err := s.ConfirmBill(ctx, u.ID, "actual-usd", due[0].ID, ledger.PaymentInput{WalletID: usd.ID, Amount: "8", Date: "2026-09-14", Rate: "125"})
	if err != nil || paid.Amount != "8.00" {
		t.Fatalf("explicit USD: %+v %v", paid, err)
	}
}
