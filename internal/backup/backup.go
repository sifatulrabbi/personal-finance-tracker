// Package backup creates consistent, standalone snapshots of the live SQLite database.
package backup

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"syscall"
	"time"

	"modernc.org/sqlite"
)

const (
	filenameTimeLayout = "20060102T150405.000000000Z"
	lockFilename       = ".simply-finance-backup.lock"
)

var (
	ErrInProgress = errors.New("another backup is already running")
	filenameRE    = regexp.MustCompile(`^simply-finance-(\d{8}T\d{6}\.\d{9}Z)-[0-9a-f]{8}\.sqlite$`)
	partialRE     = regexp.MustCompile(`^\.simply-finance-[0-9a-f]{16}\.sqlite\.partial(?:-(?:wal|shm|journal))?$`)
)

type Config struct {
	DatabasePath string
	Destination  string
	Retain       int
	Now          func() time.Time
}

type Snapshot struct {
	Path      string
	CreatedAt time.Time
	Size      int64
	FileMode  fs.FileMode
}

// Create publishes a new snapshot and then retains the newest configured number.
func Create(ctx context.Context, config Config) (Snapshot, error) {
	return create(ctx, config, false)
}

// CreateForCurrentHour publishes at most one successful snapshot in the current UTC hour.
func CreateForCurrentHour(ctx context.Context, config Config) (Snapshot, bool, error) {
	snapshot, err := create(ctx, config, true)
	if errors.Is(err, errAlreadyBackedUp) {
		return Snapshot{}, false, nil
	}
	return snapshot, err == nil, err
}

var errAlreadyBackedUp = errors.New("current UTC hour already backed up")

func create(ctx context.Context, config Config, hourly bool) (Snapshot, error) {
	if config.DatabasePath == "" {
		return Snapshot{}, errors.New("database path is required")
	}
	if config.Destination == "" {
		return Snapshot{}, errors.New("backup destination is required")
	}
	if !filepath.IsAbs(config.Destination) {
		return Snapshot{}, errors.New("backup destination must be an absolute path")
	}
	if config.Retain < 1 {
		return Snapshot{}, errors.New("backup retention must be at least one")
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	createdAt := config.Now().UTC()

	release, err := Lock(config.Destination)
	if err != nil {
		return Snapshot{}, err
	}
	defer release()
	if err = removeStalePartials(config.Destination); err != nil {
		return Snapshot{}, fmt.Errorf("clean stale backup files: %w", err)
	}
	if hourly {
		snapshots, listErr := List(config.Destination)
		if listErr != nil {
			return Snapshot{}, listErr
		}
		bucket := createdAt.Truncate(time.Hour)
		for _, snapshot := range snapshots {
			if snapshot.CreatedAt.Truncate(time.Hour).Equal(bucket) {
				return Snapshot{}, errAlreadyBackedUp
			}
		}
	}

	info, err := os.Stat(config.DatabasePath)
	if err != nil {
		return Snapshot{}, fmt.Errorf("inspect source database: %w", err)
	}
	if !info.Mode().IsRegular() {
		return Snapshot{}, errors.New("source database is not a regular file")
	}

	randomID, err := randomHex(8)
	if err != nil {
		return Snapshot{}, fmt.Errorf("generate backup identifier: %w", err)
	}
	partial := filepath.Join(config.Destination, ".simply-finance-"+randomID+".sqlite.partial")
	file, err := os.OpenFile(partial, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return Snapshot{}, fmt.Errorf("create partial backup: %w", err)
	}
	if err = file.Close(); err != nil {
		os.Remove(partial)
		return Snapshot{}, fmt.Errorf("close partial backup: %w", err)
	}
	defer removePartial(partial)

	if err = onlineCopy(ctx, config.DatabasePath, partial); err != nil {
		return Snapshot{}, fmt.Errorf("copy SQLite database: %w", err)
	}
	if err = scrubSessions(ctx, partial); err != nil {
		return Snapshot{}, fmt.Errorf("remove sessions from snapshot: %w", err)
	}
	if err = Verify(ctx, partial); err != nil {
		return Snapshot{}, fmt.Errorf("validate snapshot: %w", err)
	}
	if err = syncFile(partial); err != nil {
		return Snapshot{}, fmt.Errorf("sync snapshot: %w", err)
	}

	nameID, err := randomHex(4)
	if err != nil {
		return Snapshot{}, fmt.Errorf("generate snapshot name: %w", err)
	}
	finalPath := filepath.Join(config.Destination, "simply-finance-"+createdAt.Format(filenameTimeLayout)+"-"+nameID+".sqlite")
	if err = os.Rename(partial, finalPath); err != nil {
		return Snapshot{}, fmt.Errorf("publish snapshot: %w", err)
	}
	if err = syncDirectory(config.Destination); err != nil {
		return Snapshot{}, fmt.Errorf("sync published snapshot: %w", err)
	}
	if err = prune(config.Destination, config.Retain); err != nil {
		return Snapshot{}, fmt.Errorf("snapshot published at %s but retention failed: %w", finalPath, err)
	}
	info, err = os.Stat(finalPath)
	if err != nil {
		return Snapshot{}, fmt.Errorf("inspect published snapshot: %w", err)
	}
	return Snapshot{Path: finalPath, CreatedAt: createdAt, Size: info.Size(), FileMode: info.Mode().Perm()}, nil
}

// Lock obtains the destination-wide non-blocking process lock.
func Lock(destination string) (func() error, error) {
	info, err := os.Stat(destination)
	if err != nil {
		return nil, fmt.Errorf("inspect backup destination: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("backup destination is not a directory")
	}
	file, err := os.OpenFile(filepath.Join(destination, lockFilename), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("open backup lock: %w", err)
	}
	if err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		file.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return nil, ErrInProgress
		}
		return nil, fmt.Errorf("lock backup destination: %w", err)
	}
	return func() error {
		unlockErr := syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
		closeErr := file.Close()
		return errors.Join(unlockErr, closeErr)
	}, nil
}

// List returns application-owned completed snapshots ordered oldest first.
func List(destination string) ([]Snapshot, error) {
	entries, err := os.ReadDir(destination)
	if err != nil {
		return nil, fmt.Errorf("read backup destination: %w", err)
	}
	var snapshots []Snapshot
	for _, entry := range entries {
		matches := filenameRE.FindStringSubmatch(entry.Name())
		if len(matches) == 0 || entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return nil, fmt.Errorf("inspect backup %s: %w", entry.Name(), infoErr)
		}
		if !info.Mode().IsRegular() {
			continue
		}
		createdAt, parseErr := time.Parse(filenameTimeLayout, matches[1])
		if parseErr != nil {
			continue
		}
		snapshots = append(snapshots, Snapshot{Path: filepath.Join(destination, entry.Name()), CreatedAt: createdAt, Size: info.Size(), FileMode: info.Mode().Perm()})
	}
	sort.Slice(snapshots, func(i, j int) bool {
		if snapshots[i].CreatedAt.Equal(snapshots[j].CreatedAt) {
			return snapshots[i].Path < snapshots[j].Path
		}
		return snapshots[i].CreatedAt.Before(snapshots[j].CreatedAt)
	})
	return snapshots, nil
}

type backuper interface {
	NewBackup(string) (*sqlite.Backup, error)
}

func onlineCopy(ctx context.Context, source, destination string) error {
	return onlineCopyWithStep(ctx, source, destination, 128, nil)
}

func onlineCopyWithStep(ctx context.Context, source, destination string, pages int32, afterStep func()) error {
	abs, err := filepath.Abs(source)
	if err != nil {
		return err
	}
	u := url.URL{Scheme: "file", Path: abs}
	query := u.Query()
	query.Set("mode", "ro")
	query.Add("_pragma", "busy_timeout(5000)")
	u.RawQuery = query.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	return conn.Raw(func(driverConn any) error {
		provider, ok := driverConn.(backuper)
		if !ok {
			return errors.New("SQLite driver does not support online backup")
		}
		operation, backupErr := provider.NewBackup(destination)
		if backupErr != nil {
			return backupErr
		}
		for {
			if err := ctx.Err(); err != nil {
				operation.Finish()
				return err
			}
			more, stepErr := operation.Step(pages)
			if stepErr != nil {
				operation.Finish()
				return stepErr
			}
			if afterStep != nil {
				afterStep()
			}
			if !more {
				return operation.Finish()
			}
		}
	})
}

func scrubSessions(ctx context.Context, path string) error {
	u := url.URL{Scheme: "file", Path: path}
	query := u.Query()
	query.Set("mode", "rw")
	query.Add("_pragma", "busy_timeout(5000)")
	u.RawQuery = query.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1)
	defer db.Close()
	if _, err = db.ExecContext(ctx, `PRAGMA journal_mode=DELETE`); err != nil {
		return err
	}
	if _, err = db.ExecContext(ctx, `PRAGMA secure_delete=ON`); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `DELETE FROM sessions`)
	return err
}

// Verify checks that a snapshot is a regular, internally consistent SQLite database.
func Verify(ctx context.Context, path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("inspect snapshot: %w", err)
	}
	if !info.Mode().IsRegular() {
		return errors.New("snapshot is not a regular file")
	}
	u := url.URL{Scheme: "file", Path: path}
	query := u.Query()
	query.Set("mode", "ro")
	u.RawQuery = query.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return err
	}
	defer db.Close()
	var integrity string
	if err = db.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&integrity); err != nil {
		return err
	}
	if integrity != "ok" {
		return fmt.Errorf("integrity check: %s", integrity)
	}
	rows, err := db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		return errors.New("foreign key check found a violation")
	}
	return rows.Err()
}

func prune(destination string, retain int) error {
	snapshots, err := List(destination)
	if err != nil {
		return err
	}
	for _, snapshot := range snapshots[:max(0, len(snapshots)-retain)] {
		if err = os.Remove(snapshot.Path); err != nil {
			return fmt.Errorf("remove old backup %s: %w", filepath.Base(snapshot.Path), err)
		}
	}
	if len(snapshots) > retain {
		return syncDirectory(destination)
	}
	return nil
}

func removeStalePartials(destination string) error {
	entries, err := os.ReadDir(destination)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if partialRE.MatchString(entry.Name()) && entry.Type().IsRegular() {
			if err = os.Remove(filepath.Join(destination, entry.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}

func removePartial(path string) {
	for _, suffix := range []string{"", "-wal", "-shm", "-journal"} {
		_ = os.Remove(path + suffix)
	}
}

func randomHex(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	const digits = "0123456789abcdef"
	result := make([]byte, bytes*2)
	for i, value := range buffer {
		result[i*2] = digits[value>>4]
		result[i*2+1] = digits[value&15]
	}
	return string(result), nil
}

func syncFile(path string) error {
	file, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
