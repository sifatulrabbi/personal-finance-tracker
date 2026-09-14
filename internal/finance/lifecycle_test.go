package finance_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

func TestDatabasePreparationIsExplicit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "finance.sqlite")
	if s, err := finance.Open(path, time.Now); err == nil {
		s.Close()
		t.Fatal("open created a missing database")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("database created: %v", err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`CREATE TABLE marker(value TEXT)`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	s, err := finance.Open(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Categories(ctx); err == nil {
		t.Fatal("open migrated the database")
	}
	s.Close()
	if err = finance.Migrate(path); err != nil {
		t.Fatal(err)
	}
	s, err = finance.Open(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	before, err := s.Categories(ctx)
	if err != nil || len(before) != 2 {
		t.Fatalf("migration seeded optional defaults: %+v %v", before, err)
	}
	for i := 0; i < 2; i++ {
		if err = s.Seed(ctx); err != nil {
			t.Fatal(err)
		}
	}
	after, err := s.Categories(ctx)
	if err != nil || len(after) != 11 {
		t.Fatalf("seed: %+v %v", after, err)
	}
	if err = finance.Migrate(path); err != nil {
		t.Fatal(err)
	}
}
