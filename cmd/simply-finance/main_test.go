package main

import (
	"bytes"
	"context"
	"database/sql"
	"golang.org/x/crypto/bcrypt"
	"os"
	"path/filepath"
	"simply-finance/internal/finance"
	"strings"
	"testing"
	"time"
)

func execute(args ...string) (string, error) {
	cmd := newCommand()
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(&out)
	cmd.SetArgs(args)
	err := cmd.Execute()
	return out.String(), err
}

func TestExplicitCommandsAndHelp(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "finance.sqlite")
	t.Setenv("DATABASE_PATH", path)
	t.Setenv("AUTH_USERS_JSON", "not needed for database commands")
	for _, args := range [][]string{nil, {"--help"}, {"migrate", "--help"}, {"seed", "--help"}, {"serve", "--help"}} {
		if _, err := execute(args...); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("help touched database", err)
	}
	for _, args := range [][]string{{"unknown"}, {"migrate", "extra"}, {"seed", "--unknown"}, {"seed"}} {
		if _, err := execute(args...); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("seed created database", err)
	}
	if _, err := execute("migrate"); err != nil {
		t.Fatal(err)
	}
	s, err := finance.Open(path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	categories, err := s.Categories(context.Background())
	if err != nil || len(categories) != 2 {
		t.Fatal(categories, err)
	}
	for _, name := range []string{"seed", "migrate", "seed"} {
		if _, err := execute(name); err != nil {
			t.Fatal(err)
		}
	}
	categories, err = s.Categories(context.Background())
	if err != nil || len(categories) != 11 {
		t.Fatal(categories, err)
	}
}

func TestDatabaseFlagOverridesEnvironment(t *testing.T) {
	dir := t.TempDir()
	ignored := filepath.Join(dir, "ignored.sqlite")
	selected := filepath.Join(dir, "selected.sqlite")
	t.Setenv("DATABASE_PATH", ignored)
	if _, err := execute("migrate", "--database", selected); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(ignored); !os.IsNotExist(err) {
		t.Fatal("used environment instead of flag")
	}
}

func TestServeDoesNotPrepareDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`CREATE TABLE marker(value TEXT)`); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("test-household-password"), 10)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("AUTH_USERS_JSON", `[{"email":"test@example.test","password_hash":"`+string(hash)+`"}]`)
	t.Setenv("APP_ORIGIN", "https://finance.example.test")
	t.Setenv("ALLOW_INSECURE_COOKIES", "false")
	if _, err = execute("serve", "--database", path); err == nil {
		t.Fatal("expected unavailable application tables")
	}
	if !strings.Contains(err.Error(), "explicit migrate") {
		t.Fatal("misleading startup error", err)
	}
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE name IN ('schema_migrations','categories')`).Scan(&count); err != nil || count != 0 {
		t.Fatal("serve prepared schema", count, err)
	}
}

func TestHashPasswordCommand(t *testing.T) {
	for _, password := range []string{"short", strings.Repeat("x", 73), "test-household-password\n"} {
		cmd := newCommand()
		cmd.SetArgs([]string{"hash-password"})
		cmd.SetIn(strings.NewReader(password))
		var out bytes.Buffer
		cmd.SetOut(&out)
		err := cmd.Execute()
		if password != "test-household-password\n" {
			if err == nil {
				t.Fatal("accepted invalid password")
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		if err = bcrypt.CompareHashAndPassword([]byte(strings.TrimSpace(out.String())), []byte("test-household-password")); err != nil {
			t.Fatal(err)
		}
	}
}
