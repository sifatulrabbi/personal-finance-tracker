// Package apptest wires the use cases over a real SQLite database for tests in any package. It
// never substitutes an in-memory store: every Household is backed by a migrated SQLite file.
package apptest

import (
	"context"
	"time"
	_ "time/tzdata" // Tests load Asia/Dhaka on machines without zoneinfo.

	"simply-finance/internal/app"
	"simply-finance/internal/sqlite"
)

// Household is the use cases and their SQLite store. The store's own methods (Close, Seed,
// EnsureUser, sessions, VerifyDerivedState) sit beside the use cases.
type Household struct {
	*app.Service
	*sqlite.Store
}

// Dhaka is the household's calendar location.
func Dhaka() *time.Location {
	loc, e := time.LoadLocation("Asia/Dhaka")
	if e != nil {
		panic(e)
	}
	return loc
}

// Wrap puts the use cases over an open store with the given clock (nil is time.Now).
func Wrap(store *sqlite.Store, now func() time.Time) *Household {
	svc, e := app.New(store, app.Config{Now: now, Location: Dhaka()})
	if e != nil {
		panic(e)
	}
	return &Household{svc, store}
}

// Open migrates the database at path, opens it, and runs the seeds, as an operator prepares one.
func Open(path string, now func() time.Time) (*Household, error) {
	if e := sqlite.Migrate(path); e != nil {
		return nil, e
	}
	store, e := sqlite.Open(path)
	if e != nil {
		return nil, e
	}
	if e = store.Seed(context.Background()); e != nil {
		store.Close()
		return nil, e
	}
	return Wrap(store, now), nil
}
