package backup_test

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"simply-finance/internal/backup"
	"simply-finance/internal/finance"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func preparedDatabase(t *testing.T) (string, *sql.DB) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "finance.sqlite")
	if err := finance.Migrate(path); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err = db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO users(id,email,name) VALUES('user-1','backup@example.test','Backup Test')`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO sessions(token_hash,user_id,credential_hash,expires_at) VALUES('secret-token','user-1','secret-hash',4102444800)`); err != nil {
		t.Fatal(err)
	}
	return path, db
}

func TestCreateCapturesLiveWALAndRemovesOnlySnapshotSessions(t *testing.T) {
	source, sourceDB := preparedDatabase(t)
	destination := t.TempDir()
	now := time.Date(2026, 9, 16, 12, 34, 56, 123, time.UTC)

	result, err := backup.Create(context.Background(), backup.Config{
		DatabasePath: source,
		Destination:  destination,
		Retain:       10,
		Now:          func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.CreatedAt != now || filepath.Dir(result.Path) != destination {
		t.Fatalf("unexpected result: %+v", result)
	}
	if mode := result.FileMode; mode != 0600 {
		t.Fatalf("backup mode = %o, want 600", mode)
	}
	if filepath.Ext(result.Path) != ".sqlite" {
		t.Fatalf("backup path = %q", result.Path)
	}
	if _, err = os.Stat(result.Path + "-wal"); !os.IsNotExist(err) {
		t.Fatalf("published snapshot has WAL sidecar: %v", err)
	}

	snapshot, err := sql.Open("sqlite", "file:"+result.Path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var users, sessions int
	if err = snapshot.QueryRow(`SELECT count(*) FROM users`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if err = snapshot.QueryRow(`SELECT count(*) FROM sessions`).Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	if users != 1 || sessions != 0 {
		t.Fatalf("snapshot users=%d sessions=%d", users, sessions)
	}
	contents, err := os.ReadFile(result.Path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(contents, []byte("secret-token")) || bytes.Contains(contents, []byte("secret-hash")) {
		t.Fatal("deleted session secret remains in snapshot bytes")
	}
	if err = sourceDB.QueryRow(`SELECT count(*) FROM sessions`).Scan(&sessions); err != nil || sessions != 1 {
		t.Fatalf("source sessions=%d err=%v", sessions, err)
	}
}

func TestCreateDoesNotCaptureUncommittedWriterTransaction(t *testing.T) {
	source, sourceDB := preparedDatabase(t)
	tx, err := sourceDB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`INSERT INTO users(id,email,name) VALUES('uncommitted','uncommitted@example.test','Uncommitted')`); err != nil {
		t.Fatal(err)
	}
	result, err := backup.Create(context.Background(), backup.Config{DatabasePath: source, Destination: t.TempDir(), Retain: 10})
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := sql.Open("sqlite", "file:"+result.Path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var count int
	if err = snapshot.QueryRow(`SELECT count(*) FROM users WHERE id='uncommitted'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("backup captured an uncommitted row")
	}
}

func TestCreateCleansOnlyOwnedStalePartials(t *testing.T) {
	source, _ := preparedDatabase(t)
	destination := t.TempDir()
	stale := filepath.Join(destination, ".simply-finance-0123456789abcdef.sqlite.partial")
	unrelated := filepath.Join(destination, "someone-else.partial")
	for _, path := range []string{stale, stale + "-wal", unrelated} {
		if err := os.WriteFile(path, []byte("stale"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := backup.Create(context.Background(), backup.Config{DatabasePath: source, Destination: destination, Retain: 10}); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{stale, stale + "-wal"} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("owned partial was not removed: %s (%v)", path, err)
		}
	}
	if got, err := os.ReadFile(unrelated); err != nil || string(got) != "stale" {
		t.Fatalf("unrelated partial changed: %q %v", got, err)
	}
}

func TestCreateRetainsLatestTenSuccessfulSnapshots(t *testing.T) {
	source, _ := preparedDatabase(t)
	destination := t.TempDir()
	base := time.Date(2026, 9, 16, 0, 0, 0, 0, time.UTC)
	for hour := 0; hour < 12; hour++ {
		instant := base.Add(time.Duration(hour) * time.Hour)
		if _, err := backup.Create(context.Background(), backup.Config{
			DatabasePath: source,
			Destination:  destination,
			Retain:       10,
			Now:          func() time.Time { return instant },
		}); err != nil {
			t.Fatal(err)
		}
	}
	snapshots, err := backup.List(destination)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 10 {
		t.Fatalf("snapshots = %d, want 10", len(snapshots))
	}
	if !snapshots[0].CreatedAt.Equal(base.Add(2*time.Hour)) || !snapshots[9].CreatedAt.Equal(base.Add(11*time.Hour)) {
		t.Fatalf("unexpected retained range: %s to %s", snapshots[0].CreatedAt, snapshots[9].CreatedAt)
	}
	if err = os.WriteFile(filepath.Join(destination, "unrelated.sqlite"), []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = backup.Create(context.Background(), backup.Config{DatabasePath: source, Destination: destination, Retain: 10, Now: func() time.Time { return base.Add(12 * time.Hour) }}); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(filepath.Join(destination, "unrelated.sqlite")); err != nil || string(got) != "keep" {
		t.Fatalf("unrelated file changed: %q %v", got, err)
	}
}

func TestCreateFailureDoesNotPublishOrPrune(t *testing.T) {
	destination := t.TempDir()
	old := filepath.Join(destination, "simply-finance-20260916T010000.000000000Z-00000000.sqlite")
	if err := os.WriteFile(old, []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := backup.Create(context.Background(), backup.Config{
		DatabasePath: filepath.Join(t.TempDir(), "missing.sqlite"),
		Destination:  destination,
		Retain:       1,
		Now:          func() time.Time { return time.Date(2026, 9, 16, 2, 0, 0, 0, time.UTC) },
	})
	if err == nil {
		t.Fatal("expected missing source failure")
	}
	if got, readErr := os.ReadFile(old); readErr != nil || string(got) != "existing" {
		t.Fatalf("existing backup changed: %q %v", got, readErr)
	}
	entries, readErr := os.ReadDir(destination)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(entries) != 2 { // completed backup plus the persistent lock file
		t.Fatalf("left unexpected artifacts: %+v", entries)
	}
}

func TestCurrentHourSkipsExistingSuccess(t *testing.T) {
	source, _ := preparedDatabase(t)
	destination := t.TempDir()
	hour := time.Date(2026, 9, 16, 12, 45, 0, 0, time.FixedZone("test", 6*60*60))
	config := backup.Config{DatabasePath: source, Destination: destination, Retain: 10, Now: func() time.Time { return hour }}
	first, created, err := backup.CreateForCurrentHour(context.Background(), config)
	if err != nil || !created {
		t.Fatalf("first backup: %+v created=%t err=%v", first, created, err)
	}
	second, created, err := backup.CreateForCurrentHour(context.Background(), config)
	if err != nil || created {
		t.Fatalf("second backup: %+v created=%t err=%v", second, created, err)
	}
	snapshots, err := backup.List(destination)
	if err != nil || len(snapshots) != 1 {
		t.Fatalf("snapshots=%+v err=%v", snapshots, err)
	}
	if snapshots[0].CreatedAt.Hour() != 6 { // 12:45 at UTC+6 is the 06:00 UTC bucket.
		t.Fatalf("snapshot time is not UTC: %s", snapshots[0].CreatedAt)
	}
}

func TestCreateRejectsOverlappingProcess(t *testing.T) {
	source, _ := preparedDatabase(t)
	destination := t.TempDir()
	release, err := backup.Lock(destination)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	_, err = backup.Create(context.Background(), backup.Config{DatabasePath: source, Destination: destination, Retain: 10})
	if !errors.Is(err, backup.ErrInProgress) {
		t.Fatalf("error = %v, want ErrInProgress", err)
	}
}

func TestCreateRequiresAbsoluteDestination(t *testing.T) {
	source, _ := preparedDatabase(t)
	_, err := backup.Create(context.Background(), backup.Config{DatabasePath: source, Destination: "relative-backups", Retain: 10})
	if err == nil || !strings.Contains(err.Error(), "absolute") {
		t.Fatalf("error = %v, want absolute destination rejection", err)
	}
}
