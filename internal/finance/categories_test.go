package finance_test

import (
	"fmt"
	"simply-finance/internal/finance"
	"sync"
	"testing"
)

func TestConcurrentCategoryCreationKeepsOneExactName(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	var wg sync.WaitGroup
	results := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, e := s.CreateCategory(ctx, u.ID, fmt.Sprint("category-", i), finance.CategoryInput{Name: "Food", Type: "expense"})
			results <- e
		}(i)
	}
	wg.Wait()
	close(results)
	successes := 0
	for e := range results {
		if e == nil {
			successes++
		} else if e != finance.ErrConflict {
			t.Fatal(e)
		}
	}
	if successes != 1 {
		t.Fatalf("created %d categories", successes)
	}
	c, e := s.CreateCategory(ctx, u.ID, "income-food", finance.CategoryInput{Name: "Food", Type: "income"})
	if e != nil || c.Type != "income" {
		t.Fatalf("separate type: %+v %v", c, e)
	}
	for i, name := range []string{"", "   "} {
		if _, e = s.CreateCategory(ctx, u.ID, fmt.Sprint("invalid-", i), finance.CategoryInput{Name: name, Type: "expense"}); e != finance.ErrInvalid {
			t.Fatalf("empty name: %v", e)
		}
	}
}

func TestBillKeepsCategoryFromOccurrence(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	w := createWallet(t, s, u, "Cash", "BDT", "", "1000")
	c, e := s.CreateCategory(ctx, u.ID, "internet", finance.CategoryInput{Name: "Wi-Fi", Type: "expense"})
	if e != nil {
		t.Fatal(e)
	}
	a, e := s.CreateSchedule(ctx, u.ID, "schedule", finance.ScheduleInput{Name: "Internet", WalletID: w.ID, Amount: "100", StartDate: "2026-09-01", Frequency: "monthly", CategoryID: c.ID})
	if e != nil {
		t.Fatal(e)
	}
	bills, e := s.Due(ctx)
	if e != nil || len(bills) != 1 {
		t.Fatalf("due: %+v %v", bills, e)
	}
	a.CategoryID = ""
	if _, e = s.UpdateSchedule(ctx, u.ID, "change-category", a); e != nil {
		t.Fatal(e)
	}
	r, e := s.ConfirmBill(ctx, u.ID, "pay", bills[0].ID, finance.PaymentInput{Date: "2026-09-14"})
	if e != nil || r.CategoryID != c.ID {
		t.Fatalf("payment: %+v %v", r, e)
	}
}

func TestCategoriesKeepNamesAndEnforceTransactionType(t *testing.T) {
	s := openStore(t)
	u := user(t, s)
	all, e := s.Categories(ctx)
	if e != nil || len(all) != 11 {
		t.Fatalf("defaults: %+v %v", all, e)
	}
	c, e := s.CreateCategory(ctx, u.ID, "category", finance.CategoryInput{Name: " Eating out / FOOD ", Type: "expense"})
	if e != nil || c.Name != " Eating out / FOOD " {
		t.Fatalf("name: %+v %v", c, e)
	}
	again, e := s.CreateCategory(ctx, u.ID, "category", finance.CategoryInput{Name: c.Name, Type: c.Type})
	if e != nil || again.ID != c.ID {
		t.Fatalf("retry: %+v %v", again, e)
	}
	w := createWallet(t, s, u, "Cash", "BDT", "", "1000")
	in := finance.TransactionInput{Kind: "expense", WalletID: w.ID, Amount: "100", Date: "2026-09-14", CategoryID: c.ID}
	r, e := s.CreateTransaction(ctx, u.ID, "expense", in)
	if e != nil || r.CategoryID != c.ID {
		t.Fatalf("category: %+v %v", r, e)
	}
	in.Kind = "income"
	if _, e = s.CreateTransaction(ctx, u.ID, "wrong-type", in); e != finance.ErrInvalid {
		t.Fatalf("wrong type: %v", e)
	}
	in.CategoryID = ""
	r, e = s.CreateTransaction(ctx, u.ID, "income", in)
	if e != nil || r.CategoryID != "others-income" {
		t.Fatalf("default: %+v %v", r, e)
	}
	in.Kind = "transfer"
	in.CategoryID = c.ID
	if _, e = s.CreateTransaction(ctx, u.ID, "transfer", in); e != finance.ErrInvalid {
		t.Fatalf("transfer: %v", e)
	}
}
