package app_test

import (
	"testing"
	"time"

	"simply-finance/internal/apptest"
	"simply-finance/internal/sqlite"
)

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
