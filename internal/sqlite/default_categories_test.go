package sqlite_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDefaultCategorySeedPreservesExistingIDs(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob("migrations/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`CREATE TABLE schema_migrations(name TEXT PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		body, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(string(body)); err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(`INSERT INTO schema_migrations VALUES(?)`, filepath.Base(file)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = db.Exec(`INSERT INTO categories(id,type,name) VALUES('existing-id','expense','Groceries'),('income-id','income','Groceries')`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	for i := 0; i < 2; i++ {
		s, err := openExisting(path, time.Now)
		if err != nil {
			t.Fatal(err)
		}
		if err = s.Seed(ctx); err != nil {
			t.Fatal(err)
		}
		all, err := s.Categories(ctx)
		s.Close()
		if err != nil || len(all) != 12 {
			t.Fatalf("categories: %+v %v", all, err)
		}
		expected := map[string]bool{"Groceries": false, "Restaurant meals": false, "Clothes": false, "Electricity bill": false, "Apartment rent": false, "Maid": false, "Transportation": false, "WiFi and Mobile": false, "Household misc": false}
		for _, c := range all {
			if c.Type != "expense" {
				continue
			}
			if _, ok := expected[c.Name]; ok {
				expected[c.Name] = true
			}
			if c.Name == "Groceries" && c.ID != "existing-id" {
				t.Fatalf("ID replaced: %+v", c)
			}
		}
		for name, found := range expected {
			if !found {
				t.Errorf("missing %s", name)
			}
		}
	}
}

// Regression: the seed's conflict target named only (type,name), so a renamed default kept its
// seeded ID and rerunning the seed failed on that ID instead of leaving the rename alone.
func TestDefaultCategorySeedKeepsARenamedDefault(t *testing.T) {
	path := filepath.Join(t.TempDir(), "renamed.sqlite")
	s, err := openPrepared(t, path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err = s.RenameCategory(ctx, user(t, s).ID, "rename", "expense-groceries", 1, "Bazaar"); err != nil {
		t.Fatal(err)
	}
	if err = s.Seed(ctx); err != nil {
		t.Fatalf("reseed after rename: %v", err)
	}
	all, err := s.Categories(ctx)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]string{}
	for _, c := range all {
		names[c.Name] = c.ID
	}
	if names["Bazaar"] != "expense-groceries" {
		t.Fatalf("rename lost: %+v", all)
	}
	if id, back := names["Groceries"]; back {
		t.Fatalf("seed recreated Groceries as %s", id)
	}
}
