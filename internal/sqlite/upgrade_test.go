package sqlite_test

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"simply-finance/internal/ledger"
	"testing"
	"time"
)

// legacyDatabase applies the embedded migrations up to and including last, records them as
// applied the way Migrate does, runs setup against the raw database, and returns its path. The
// caller then runs the current Migrate over it, as an operator upgrade would.
func legacyDatabase(t *testing.T, last, setup string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "legacy.sqlite")
	db, e := sql.Open("sqlite", path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	files, e := os.ReadDir("migrations")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(`CREATE TABLE schema_migrations(name TEXT PRIMARY KEY)`); e != nil {
		t.Fatal(e)
	}
	for _, f := range files {
		if f.Name() > last {
			break
		}
		raw, e := os.ReadFile(filepath.Join("migrations", f.Name()))
		if e != nil {
			t.Fatal(e)
		}
		if _, e = db.Exec(string(raw)); e != nil {
			t.Fatal(f.Name(), e)
		}
		if _, e = db.Exec(`INSERT INTO schema_migrations VALUES(?)`, f.Name()); e != nil {
			t.Fatal(e)
		}
	}
	if _, e = db.Exec(`INSERT INTO users VALUES('user','old@example.test','Old');` + setup); e != nil {
		t.Fatal(e)
	}
	return path
}

// The balance version starts from the old combined version, so a client holding a version read
// before the upgrade is neither wrongly accepted nor wrongly refused for either kind of edit.
func TestUpgradeCarriesTheWalletVersionIntoBothVersions(t *testing.T) {
	path := legacyDatabase(t, "006_bill_categories.sql", `INSERT INTO wallets(id,name,type,currency,details,credit_limit,version) VALUES('cash','Cash','physical','BDT','',0,5);`)
	s, e := openPrepared(t, path, time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	w, e := s.Wallet(ctx, "cash")
	if e != nil || w.Version != 5 || w.BalanceVersion != 5 {
		t.Fatalf("%+v %v", w, e)
	}
}

// Targets persisted by the old first-read initialization stay as saved snapshots when they carry an
// amount, but an initialized "no target" row (never explicitly set) is dropped so the month
// inherits instead of staying frozen empty.
func TestUpgradeDropsTargetRowsThatOnlyRecordedNoTarget(t *testing.T) {
	path := legacyDatabase(t, "007_wallet_balance_version.sql", `INSERT INTO monthly_targets VALUES('2026-01',3000000,2),('2026-02',NULL,1),('2026-03',3000000,1),('2026-06',NULL,1);`)
	s, e := openPrepared(t, path, time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	for month, want := range map[string]ledger.MonthlyTarget{
		"2026-01": {Amount: "30000.00", Version: 2},
		"2026-02": {Amount: "30000.00", Version: 1, InheritedFrom: "2026-01"},
		"2026-03": {Amount: "30000.00", Version: 1},
		"2026-06": {Amount: "30000.00", Version: 1, InheritedFrom: "2026-03"},
	} {
		m, e := s.Monthly(ctx, month)
		if e != nil || m.Target != want {
			t.Errorf("%s: %+v %v, want %+v", month, m.Target, e, want)
		}
	}
}

// Debit cards created before bank links existed hold their own entries. Linking them to a bank
// automatically could double or drop money, so they stay as legacy cards: their balance and
// history survive the upgrade unchanged, they take no new income, expenses, incoming transfers, or
// schedules, and they can only be drained by a transfer out or an adjustment to zero.
func TestUpgradeKeepsLegacyDebitCardsAndOnlyLetsThemDrain(t *testing.T) {
	opening := `{"kind":"opening","wallet_id":"debit","amount":"5000.00","date":"2026-09-01"}`
	spend := `{"id":"spend","version":1,"kind":"expense","wallet_id":"debit","amount":"1000.00","bdt_amount":"1000.00","date":"2026-09-02","note":"Grocereis"}`
	path := legacyDatabase(t, "008_monthly_target_inheritance.sql", `
INSERT INTO wallets(id,name,type,card_type,currency,details,credit_limit) VALUES('bank','Bank','bank','','BDT','',0),('debit','Debit','card','debit','BDT','',0);
INSERT INTO transactions VALUES('open',1,0),('spend',1,0);
INSERT INTO transaction_revisions VALUES('open',1,'`+opening+`','user','2026-09-01T00:00:00Z'),('spend',1,'`+spend+`','user','2026-09-02T00:00:00Z');
INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta) VALUES('open',1,'debit',500000),('spend',1,'debit',-100000);`)
	s, e := openPrepared(t, path, func() time.Time { return time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC) })
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	u := user(t, s)
	card, e := s.Wallet(ctx, "debit")
	if e != nil || card.Balance != "4000.00" || card.BankWalletID != "" {
		t.Fatalf("legacy card: %+v %v", card, e)
	}
	history, e := s.History(ctx, "spend")
	if e != nil || len(history) != 1 || history[0].Amount != "1000.00" {
		t.Fatalf("history: %+v %v", history, e)
	}
	blocked := []ledger.TransactionInput{
		{Kind: "expense", WalletID: "debit", Amount: "1", Date: "2026-09-14"},
		{Kind: "income", WalletID: "debit", Amount: "1", Date: "2026-09-14"},
		{Kind: "transfer", WalletID: "bank", ToWalletID: "debit", Amount: "1", Date: "2026-09-14"},
	}
	for i, in := range blocked {
		if _, e = s.CreateTransaction(ctx, u.ID, fmt.Sprint("blocked", i), in); !errors.Is(e, ledger.ErrInvalid) {
			t.Errorf("%s on a legacy debit card: %v", in.Kind, e)
		}
	}
	if _, e = s.CreateSchedule(ctx, u.ID, "schedule", ledger.ScheduleInput{Name: "Rent", WalletID: "debit", Amount: "1", Frequency: "monthly", StartDate: "2026-09-01"}); !errors.Is(e, ledger.ErrInvalid) {
		t.Errorf("schedule on a legacy debit card: %v", e)
	}
	if _, e = s.AdjustWallet(ctx, u.ID, "adjust-up", "debit", card.BalanceVersion, "4500", "", "Count"); !errors.Is(e, ledger.ErrInvalid) {
		t.Errorf("adjust a legacy card to a non-zero balance: %v", e)
	}
	// Repairs of existing records stay available.
	fixed, e := s.ReviseTransaction(ctx, u.ID, "fix", "spend", 1, ledger.TransactionInput{Kind: "expense", WalletID: "debit", Amount: "1000", Date: "2026-09-02", Note: "Groceries"}, false)
	if e != nil || fixed.Note != "Groceries" {
		t.Fatalf("correction: %+v %v", fixed, e)
	}
	// Draining: move part to the bank, adjust the rest to zero.
	if _, e = s.CreateTransaction(ctx, u.ID, "drain", ledger.TransactionInput{Kind: "transfer", WalletID: "debit", ToWalletID: "bank", Amount: "1500", Date: "2026-09-14"}); e != nil {
		t.Fatal(e)
	}
	card, _ = s.Wallet(ctx, "debit")
	if _, e = s.AdjustWallet(ctx, u.ID, "zero", "debit", card.BalanceVersion, "0", "", "Same money as the bank account"); e != nil {
		t.Fatal(e)
	}
	card, _ = s.Wallet(ctx, "debit")
	bank, _ := s.Wallet(ctx, "bank")
	if card.Balance != "0.00" || bank.Balance != "1500.00" {
		t.Fatalf("after draining: card %s bank %s", card.Balance, bank.Balance)
	}
}
