package httpapi_test

import (
	"database/sql"
	"fmt"
	"simply-finance/internal/ledger"
	"testing"
)

func TestSingleTransactionAndScheduleReads(t *testing.T) {
	h := newHousehold(t)
	var cash ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Cash", Type: "physical", OpeningBalance: "500"}, "cash", &cash)
	var expense ledger.Transaction
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: cash.ID, Amount: "20", Date: "2026-09-10", Note: "Tea"}, "tea", &expense)
	var got ledger.Transaction
	h.spouse.ok("GET", "/transactions/"+expense.ID, nil, "", &got)
	if got.ID != expense.ID || got.Amount != "20.00" || got.ActorEmail != "sifatul@example.test" || got.CreatedAt == "" || got.Voided || got.CategoryID != "others-expense" {
		t.Fatalf("read: %+v", got)
	}
	h.spouse.ok("POST", "/transactions/"+expense.ID+"/void", map[string]any{"version": 1, "reason": "Duplicate"}, "void", nil)
	h.me.ok("GET", "/transactions/"+expense.ID, nil, "", &got)
	if !got.Voided || got.Version != 2 || got.ActorEmail != "wife@example.test" {
		t.Fatalf("after void: %+v", got)
	}
	h.me.fails("GET", "/transactions/missing", nil, "", 404, "not_found")

	var schedule, read ledger.Schedule
	h.me.ok("POST", "/schedules", ledger.ScheduleInput{Name: "Rent", WalletID: cash.ID, Amount: "100", Frequency: "monthly", StartDate: "2026-10-01"}, "rent", &schedule)
	h.spouse.ok("GET", "/schedules/"+schedule.ID, nil, "", &read)
	if read != schedule {
		t.Fatalf("schedule: %+v, want %+v", read, schedule)
	}
	h.me.fails("GET", "/schedules/missing", nil, "", 404, "not_found")
}

func TestBillHistoryUpcomingAndConfirmDateDefault(t *testing.T) {
	h := newHousehold(t)
	var bank ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Bank", Type: "bank", OpeningBalance: "10000"}, "bank", &bank)
	var internet, paused ledger.Schedule
	h.me.ok("POST", "/schedules", ledger.ScheduleInput{Name: "Internet", WalletID: bank.ID, Amount: "1000", Frequency: "monthly", StartDate: "2026-08-01"}, "internet", &internet)
	h.me.ok("POST", "/schedules", ledger.ScheduleInput{Name: "Gym", WalletID: bank.ID, Amount: "50", Frequency: "weekly", StartDate: "2026-09-20"}, "gym", &paused)
	paused.Active = false
	h.me.ok("PUT", "/schedules/"+paused.ID, paused, "pause-gym", nil)

	var due []ledger.Bill
	h.me.ok("GET", "/bills?status=due", nil, "", &due)
	if len(due) != 2 || due[0].DueDate != "2026-08-01" || due[1].DueDate != "2026-09-01" {
		t.Fatalf("due: %+v", due)
	}
	// An omitted payment date is the bill's due date.
	var paid ledger.Transaction
	h.me.ok("POST", "/bills/"+due[0].ID+"/confirm", map[string]any{}, "pay-august", &paid)
	if paid.Date != "2026-08-01" || paid.Amount != "1000.00" {
		t.Fatalf("payment: %+v", paid)
	}
	h.me.ok("POST", "/bills/"+due[1].ID+"/skip", map[string]any{"reason": "Waived"}, "skip-september", nil)

	for status, want := range map[string]string{"due": "", "paid": "2026-08-01", "skipped": "2026-09-01"} {
		var bills []ledger.Bill
		h.spouse.ok("GET", "/bills?status="+status, nil, "", &bills)
		if (want == "") != (len(bills) == 0) || (want != "" && (len(bills) != 1 || bills[0].DueDate != want || bills[0].Status != status)) {
			t.Errorf("%s: %+v", status, bills)
		}
		if status == "paid" && len(bills) == 1 && bills[0].TransactionID != paid.ID {
			t.Errorf("paid bill lost its payment: %+v", bills[0])
		}
	}
	h.me.fails("GET", "/bills?status=overdue", nil, "", 400, "validation_failed")

	var upcoming []ledger.UpcomingBill
	h.me.ok("GET", "/bills/upcoming?days=60", nil, "", &upcoming)
	if len(upcoming) != 2 || upcoming[0].DueDate != "2026-10-01" || upcoming[1].DueDate != "2026-11-01" || upcoming[0].ScheduleID != internet.ID || upcoming[0].Amount != "1000.00" {
		t.Fatalf("upcoming: %+v", upcoming)
	}
	for _, bad := range []string{"0", "367", "soon"} {
		env := h.me.fails("GET", "/bills/upcoming?days="+bad, nil, "", 400, "validation_failed")
		if env.Error.Field != "days" {
			t.Errorf("days=%s field %q", bad, env.Error.Field)
		}
	}
	// Upcoming occurrences are computed, never stored.
	if n := h.count("bill_occurrences"); n != 2 {
		t.Fatalf("stored occurrences: %d", n)
	}
}

func TestUpcomingBillsAreCapped(t *testing.T) {
	h := newHousehold(t)
	var bank ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Bank", Type: "bank"}, "bank", &bank)
	for i := 0; i < 5; i++ {
		h.me.ok("POST", "/schedules", ledger.ScheduleInput{Name: fmt.Sprint("Weekly ", i), WalletID: bank.ID, Amount: "1", Frequency: "weekly", StartDate: "2026-09-15"}, fmt.Sprint("weekly", i), nil)
	}
	var upcoming []ledger.UpcomingBill
	h.me.ok("GET", "/bills/upcoming?days=366", nil, "", &upcoming)
	if len(upcoming) != 200 {
		t.Fatalf("got %d upcoming bills, want the cap of 200", len(upcoming))
	}
	for i := 1; i < len(upcoming); i++ {
		if upcoming[i].DueDate < upcoming[i-1].DueDate {
			t.Fatalf("not sorted at %d", i)
		}
	}
}

func TestSummaryForTheHomeScreen(t *testing.T) {
	h := newHousehold(t)
	var bank, usd, card, credit, cash ledger.Wallet
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Bank", Type: "bank", OpeningBalance: "10000"}, "bank", &bank)
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Dollars", Type: "bank", Currency: "USD", OpeningBalance: "100"}, "usd", &usd)
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Debit", Type: "card", CardType: "debit", BankWalletID: bank.ID}, "debit", &card)
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Credit", Type: "card", CardType: "credit", CreditLimit: "50000", OpeningBalance: "2000"}, "credit", &credit)
	h.me.ok("POST", "/wallets", ledger.WalletInput{Name: "Pocket", Type: "physical", OpeningBalance: "500"}, "cash", &cash)
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: card.ID, Amount: "1000", Date: "2026-09-10"}, "september", nil)
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: bank.ID, Amount: "300", Date: "2026-08-20"}, "august", nil)
	h.me.ok("POST", "/transactions", ledger.TransactionInput{Kind: "expense", WalletID: credit.ID, Amount: "250", Date: "2026-09-12"}, "card-spend", nil)
	h.me.ok("PUT", "/monthly/2026-08/target", map[string]any{"amount": "30000", "version": 1}, "august-target", nil)
	h.me.ok("POST", "/schedules", ledger.ScheduleInput{Name: "Internet", WalletID: bank.ID, Amount: "1000", Frequency: "monthly", StartDate: "2026-09-01"}, "internet", nil)

	var sum ledger.Summary
	h.spouse.ok("GET", "/summary", nil, "", &sum)
	if sum.Today != "2026-09-14" || len(sum.Totals) != 2 {
		t.Fatalf("summary: %+v", sum)
	}
	bdt, dollars := sum.Totals[0], sum.Totals[1]
	// Cash excludes card debt and the debit card (its spending is already in the bank's balance).
	if bdt.Currency != "BDT" || bdt.Cash != "9200.00" || bdt.CardDebt != "2250.00" || bdt.AvailableCredit != "47750.00" {
		t.Errorf("BDT: %+v", bdt)
	}
	if dollars.Currency != "USD" || dollars.Cash != "100.00" || dollars.CardDebt != "0.00" || dollars.AvailableCredit != "0.00" {
		t.Errorf("USD: %+v", dollars)
	}
	if sum.Month.Month != "2026-09" || sum.Month.Spent != "1250.00" || sum.Month.Target.Amount != "30000.00" || sum.Month.Target.InheritedFrom != "2026-08" {
		t.Errorf("month: %+v", sum.Month)
	}
	// The schedule's first bill counts as due even though nobody opened the bills list yet.
	if sum.Bills.DueCount != 1 || sum.Bills.OldestDueDate != "2026-09-01" || sum.Bills.NextDueDate != "2026-10-01" {
		t.Errorf("bills: %+v", sum.Bills)
	}
	if len(sum.Recent) != 5 || sum.Recent[0].Date != "2026-09-14" || sum.LegacyDebitCards != 0 {
		t.Errorf("recent: %+v legacy %d", sum.Recent, sum.LegacyDebitCards)
	}
	for _, r := range sum.Recent {
		if r.ActorEmail == "" || r.CreatedAt == "" {
			t.Errorf("recent record without attribution: %+v", r)
		}
	}
	// Reading the summary stores nothing.
	if n := h.count("bill_occurrences"); n != 0 {
		t.Errorf("summary stored %d occurrences", n)
	}
	if n := h.count("monthly_targets"); n != 1 {
		t.Errorf("summary stored targets: %d rows", n)
	}
}

// count reads a table's row count through a separate connection to the test database.
func (h *household) count(table string) int {
	h.t.Helper()
	db, e := sql.Open("sqlite", h.path)
	if e != nil {
		h.t.Fatal(e)
	}
	defer db.Close()
	var n int
	if e = db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&n); e != nil {
		h.t.Fatal(e)
	}
	return n
}
