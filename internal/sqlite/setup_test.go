package sqlite_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"simply-finance/internal/apptest"
	"simply-finance/internal/ledger"
	"simply-finance/internal/sqlite"
)

var ctx = context.Background()

// openPrepared migrates, opens, and seeds a temporary SQLite database with the use cases over it.
func openPrepared(t *testing.T, path string, now func() time.Time) (*apptest.Household, error) {
	t.Helper()
	return apptest.Open(path, now)
}

// openExisting opens a database without preparing it.
func openExisting(path string, now func() time.Time) (*apptest.Household, error) {
	store, e := sqlite.Open(path)
	if e != nil {
		return nil, e
	}
	return apptest.Wrap(store, now), nil
}

// rawDB opens the file directly, to corrupt or inspect rows the application never exposes.
func rawDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, e := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func ids(records []ledger.Transaction) []string {
	out := []string{}
	for _, r := range records {
		out = append(out, r.ID)
	}
	return out
}

func user(t *testing.T, s *apptest.Household) ledger.User {
	t.Helper()
	u, e := s.EnsureUser(ctx, "sifatul@example.test", "Sifatul")
	if e != nil {
		t.Fatal(e)
	}
	return u
}
