package finance_test

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"simply-finance/internal/finance"
)

func TestConcurrentRetriesAcrossConnectionsOnlyDeductOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "concurrent.sqlite")
	s, err := finance.Open(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	other, err := finance.Open(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	u := user(t, s)
	w := createWallet(t, s, u, "Cash", "BDT", "", "1000")
	var wg sync.WaitGroup
	errors := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			store := s
			if i%2 == 0 {
				store = other
			}
			_, err := store.CreateTransaction(ctx, u.ID, "same-payment", finance.TransactionInput{Kind: "expense", WalletID: w.ID, Amount: "100", Date: "2026-09-14"})
			errors <- err
		}(i)
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	wallets, err := s.Wallets(ctx)
	if err != nil || wallets[0].Balance != "900.00" {
		t.Fatalf("wallets: %+v %v", wallets, err)
	}
}

func TestFailedTransferRollsBackBothSidesAndCanRetry(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	source := createWallet(t, s, u, "source", "BDT", "", "1000")
	destination := createWallet(t, s, u, "destination", "BDT", "", finance.FormatMoney(finance.MaxMoney))
	in := finance.TransactionInput{Kind: "transfer", WalletID: source.ID, ToWalletID: destination.ID, Amount: "1", Date: "2026-09-14"}
	if _, err := s.CreateTransaction(ctx, u.ID, "transfer", in); err != finance.ErrInvalid {
		t.Fatalf("overflow: %v", err)
	}
	ws, err := s.Wallets(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, w := range ws {
		if w.ID == source.ID && w.Balance != "1000.00" {
			t.Fatal("source deduction was not rolled back")
		}
	}
	if _, err = s.AdjustWallet(ctx, u.ID, "room", destination.ID, destination.Version, "0", "Correct opening balance"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.CreateTransaction(ctx, u.ID, "transfer", in); err != nil {
		t.Fatalf("retry after rollback: %v", err)
	}
}

func TestConcurrentCorrectionsRejectTheStaleVersion(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "Cash", "BDT", "", "1000")
	in := finance.TransactionInput{Kind: "expense", WalletID: w.ID, Amount: "100", Date: "2026-09-14"}
	r, err := s.CreateTransaction(ctx, u.ID, "expense", in)
	if err != nil {
		t.Fatal(err)
	}
	in.Amount = "200"
	in.Reason = "Correction"
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func(i int) {
			_, e := s.ReviseTransaction(ctx, u.ID, fmt.Sprintf("edit-%d", i), r.ID, 1, in, false)
			results <- e
		}(i)
	}
	one, two := <-results, <-results
	if !((one == nil && two == finance.ErrConflict) || (two == nil && one == finance.ErrConflict)) {
		t.Fatalf("results: %v, %v", one, two)
	}
}

func TestWalletListIsOneConsistentTransferSnapshot(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	a := createWallet(t, s, u, "a", "BDT", "", "1000")
	b := createWallet(t, s, u, "b", "BDT", "", "1000")
	done := make(chan error, 1)
	go func() {
		for i := 0; i < 100; i++ {
			_, e := s.CreateTransaction(ctx, u.ID, fmt.Sprintf("move-%d", i), finance.TransactionInput{Kind: "transfer", WalletID: a.ID, ToWalletID: b.ID, Amount: "1", Date: "2026-09-14"})
			if e != nil {
				done <- e
				return
			}
		}
		done <- nil
	}()
	consistent := true
	for i := 0; i < 100; i++ {
		ws, e := s.Wallets(ctx)
		if e != nil {
			t.Error(e)
			break
		}
		var total int64
		for _, w := range ws {
			n, _ := finance.ParseMoney(w.Balance)
			total += n
		}
		if total != 200000 {
			consistent = false
		}
	}
	if e := <-done; e != nil {
		t.Fatal(e)
	}
	if !consistent {
		t.Fatal("wallet list mixed balances from before and after a transfer")
	}
}
