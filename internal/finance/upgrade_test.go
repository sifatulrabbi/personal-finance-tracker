package finance_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"simply-finance/internal/finance"
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
	for month, want := range map[string]finance.MonthlyTarget{
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
