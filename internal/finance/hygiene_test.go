package finance_test

import (
	"database/sql"
	"errors"
	"path/filepath"
	"simply-finance/internal/finance"
	"sync"
	"testing"
	"time"
)

type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *clock) Set(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = t
}

func clockedStore(t *testing.T) (*finance.Store, *clock, string) {
	t.Helper()
	c := &clock{now: time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)}
	path := filepath.Join(t.TempDir(), "clocked.sqlite")
	s, e := openPrepared(t, path, c.Now)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	return s, c, path
}

// Regression (C10): a weekly schedule starting in 1900 created 6,612 due bills in one read. A new
// schedule may start at most 366 days before today (Asia/Dhaka), which bounds the catch-up.
func TestScheduleStartDateIsBoundedInThePast(t *testing.T) {
	s := openStore(t) // today is 2026-09-14 in Dhaka
	u := user(t, s)
	w := createWallet(t, s, u, "bank", "BDT", "", "0")
	in := finance.ScheduleInput{Name: "Rent", WalletID: w.ID, Amount: "10", Frequency: "weekly"}
	for start, ok := range map[string]bool{"2025-09-13": true, "2025-09-12": false, "1900-01-01": false, "2027-01-01": true} {
		in.StartDate = start
		_, e := s.CreateSchedule(ctx, u.ID, "schedule-"+start, in)
		var fe *finance.Error
		if ok != (e == nil) || (!ok && (!errors.As(e, &fe) || fe.Field != "start_date")) {
			t.Errorf("start %s: %v", start, e)
		}
	}
	due, e := s.Due(ctx)
	if e != nil || len(due) != 53 {
		t.Fatalf("due after the longest allowed catch-up: %d %v", len(due), e)
	}
}

// Regression (C8): a transfer between two USD wallets, or a cross-currency transfer with both
// amounts given, needed a BDT rate even though nothing was converted.
func TestRateIsRequiredOnlyWhenAConversionHappens(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	usd := createWallet(t, s, u, "usd", "USD", "", "100")
	savings := createWallet(t, s, u, "usd-savings", "USD", "", "0")
	bdt := createWallet(t, s, u, "bdt", "BDT", "", "0")
	same, e := s.CreateTransaction(ctx, u.ID, "usd-usd", finance.TransactionInput{Kind: "transfer", WalletID: usd.ID, ToWalletID: savings.ID, Amount: "10", Date: "2026-09-14"})
	if e != nil || same.Rate != "" || same.BDTAmount != "" || same.ReceivedAmount != "10.00" {
		t.Fatalf("USD to USD: %+v %v", same, e)
	}
	both, e := s.CreateTransaction(ctx, u.ID, "usd-bdt", finance.TransactionInput{Kind: "transfer", WalletID: usd.ID, ToWalletID: bdt.ID, Amount: "10", ReceivedAmount: "1230", Date: "2026-09-14"})
	if e != nil || both.Rate != "" || both.BDTAmount != "1230.00" {
		t.Fatalf("both amounts: %+v %v", both, e)
	}
	for key, in := range map[string]finance.TransactionInput{
		"derive":  {Kind: "transfer", WalletID: usd.ID, ToWalletID: bdt.ID, Amount: "1", Date: "2026-09-14"},
		"expense": {Kind: "expense", WalletID: usd.ID, Amount: "1", Date: "2026-09-14"},
		"income":  {Kind: "income", WalletID: usd.ID, Amount: "1", Date: "2026-09-14"},
	} {
		if _, e = s.CreateTransaction(ctx, u.ID, key, in); !errors.Is(e, finance.ErrRateRequired) {
			t.Errorf("%s without a rate: %v", key, e)
		}
	}
	// With a default set, USD transfers still snapshot it.
	if _, e = s.SetRate(ctx, u.ID, "rate", "120", 1); e != nil {
		t.Fatal(e)
	}
	snap, e := s.CreateTransaction(ctx, u.ID, "usd-usd-rate", finance.TransactionInput{Kind: "transfer", WalletID: savings.ID, ToWalletID: usd.ID, Amount: "5", Date: "2026-09-14"})
	if e != nil || snap.Rate != "120.000000" || snap.BDTAmount != "600.00" {
		t.Fatalf("snapshot: %+v %v", snap, e)
	}
	ws := balances(t, s)
	if ws[usd.ID] != "85.00" || ws[savings.ID] != "5.00" || ws[bdt.ID] != "1230.00" {
		t.Fatalf("balances: %+v", ws)
	}
}

// Regression (C9): RFC3339Nano trims trailing zeros, so "…00.12Z" sorted after "…00.123Z" and a
// later record could list below an earlier one on the same date. New writes use a fixed width,
// and records written at the same instant fall back to insertion order.
func TestSameDayRecordsListNewestFirst(t *testing.T) {
	s, c, _ := clockedStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "cash", "BDT", "", "1000")
	base := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	names := []string{"first", "second", "third", "fourth"}
	for i, offset := range []time.Duration{120 * time.Millisecond, 123 * time.Millisecond, 123 * time.Millisecond, 2 * time.Second} {
		c.Set(base.Add(offset))
		if _, e := s.CreateTransaction(ctx, u.ID, names[i], finance.TransactionInput{Kind: "expense", WalletID: w.ID, Amount: "1", Date: "2026-09-10", Note: names[i]}); e != nil {
			t.Fatal(e)
		}
	}
	list, e := s.Transactions(ctx, 10, 0)
	if e != nil {
		t.Fatal(e)
	}
	got := []string{}
	for _, r := range list {
		if r.Kind == "expense" {
			got = append(got, r.Note)
			if len(r.CreatedAt) != len("2026-09-14T12:00:00.000000000Z") {
				t.Errorf("variable-width timestamp %q", r.CreatedAt)
			}
		}
	}
	if len(got) != 4 || got[0] != "fourth" || got[1] != "third" || got[2] != "second" || got[3] != "first" {
		t.Fatalf("order: %v", got)
	}
}

// Regression (S9): request keys kept every write's full response forever. Keys now expire after
// finance.RequestKeyTTL and are pruned on later writes; a retry inside the window still replays.
func TestRequestKeysExpireAfterTheirTTL(t *testing.T) {
	s, c, path := clockedStore(t)
	u := user(t, s)
	in := finance.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "10"}
	first, e := s.CreateWallet(ctx, u.ID, "wallet", in)
	if e != nil {
		t.Fatal(e)
	}
	c.Set(c.Now().Add(finance.RequestKeyTTL - time.Minute))
	again, e := s.CreateWallet(ctx, u.ID, "wallet", in)
	if e != nil || again.ID != first.ID {
		t.Fatalf("retry inside the window: %+v %v", again, e)
	}
	c.Set(c.Now().Add(2 * time.Minute))
	in.Name = "Pocket"
	later, e := s.CreateWallet(ctx, u.ID, "wallet", in)
	if e != nil || later.ID == first.ID {
		t.Fatalf("expired key: %+v %v", later, e)
	}
	db, e := sql.Open("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	var rows int
	if e = db.QueryRow(`SELECT count(*) FROM request_keys`).Scan(&rows); e != nil || rows != 1 {
		t.Fatalf("stored keys: %d %v", rows, e)
	}
}
