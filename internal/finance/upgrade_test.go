package finance_test

import (
	"database/sql"
	"os"
	"path/filepath"
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
