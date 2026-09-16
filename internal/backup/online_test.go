package backup

import (
	"context"
	"database/sql"
	"path/filepath"
	"sync"
	"testing"

	_ "modernc.org/sqlite"
)

func TestOnlineCopyRemainsConsistentAcrossConcurrentCommit(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source.sqlite")
	destination := filepath.Join(dir, "snapshot.sqlite")
	db, err := sql.Open("sqlite", "file:"+source+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`
		CREATE TABLE first_version(value INTEGER NOT NULL);
		CREATE TABLE second_version(value INTEGER NOT NULL);
		CREATE TABLE payload(value BLOB NOT NULL);
		INSERT INTO first_version VALUES(1);
		INSERT INTO second_version VALUES(1);
		INSERT INTO payload VALUES(zeroblob(1048576));
	`); err != nil {
		t.Fatal(err)
	}

	commitRequested := make(chan struct{})
	commitFinished := make(chan error, 1)
	go func() {
		<-commitRequested
		tx, txErr := db.Begin()
		if txErr == nil {
			_, txErr = tx.Exec(`UPDATE first_version SET value=2`)
		}
		if txErr == nil {
			_, txErr = tx.Exec(`UPDATE second_version SET value=2`)
		}
		if txErr == nil {
			txErr = tx.Commit()
		} else if tx != nil {
			_ = tx.Rollback()
		}
		commitFinished <- txErr
	}()

	var once sync.Once
	var commitErr error
	afterStep := func() {
		once.Do(func() {
			close(commitRequested)
			commitErr = <-commitFinished
		})
	}
	if err = onlineCopyWithStep(context.Background(), source, destination, 1, afterStep); err != nil {
		t.Fatal(err)
	}
	if commitErr != nil {
		t.Fatalf("concurrent commit: %v", commitErr)
	}

	snapshot, err := sql.Open("sqlite", "file:"+destination+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var first, second int
	if err = snapshot.QueryRow(`SELECT value FROM first_version`).Scan(&first); err != nil {
		t.Fatal(err)
	}
	if err = snapshot.QueryRow(`SELECT value FROM second_version`).Scan(&second); err != nil {
		t.Fatal(err)
	}
	if first != second || (first != 1 && first != 2) {
		t.Fatalf("snapshot crossed transaction boundary: first=%d second=%d", first, second)
	}
}
