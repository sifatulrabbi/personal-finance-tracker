package backup_test

import (
	"context"
	"os"
	"path/filepath"
	"simply-finance/internal/backup"
	"strings"
	"testing"
	"time"
)

func TestAgentBacksUpImmediatelyAndStopsCleanly(t *testing.T) {
	source, _ := preparedDatabase(t)
	destination := t.TempDir()
	health := filepath.Join(t.TempDir(), "success")
	now := time.Date(2026, 9, 16, 12, 30, 0, 0, time.UTC)
	var delay time.Duration
	var logs []string
	agent := backup.Agent{
		Config:      backup.Config{DatabasePath: source, Destination: destination, Retain: 10, Now: func() time.Time { return now }},
		SuccessFile: health,
		Logf:        func(format string, args ...any) { logs = append(logs, format) },
		Wait: func(_ context.Context, duration time.Duration) error {
			delay = duration
			return context.Canceled
		},
	}
	if err := agent.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if delay != 30*time.Minute {
		t.Fatalf("delay = %s", delay)
	}
	if len(logs) != 1 || !strings.Contains(logs[0], "backup succeeded") {
		t.Fatalf("logs = %#v", logs)
	}
	if _, err := os.Stat(health); err != nil {
		t.Fatalf("health state: %v", err)
	}
	snapshots, err := backup.List(destination)
	if err != nil || len(snapshots) != 1 {
		t.Fatalf("snapshots=%+v err=%v", snapshots, err)
	}
}

func TestAgentSurvivesBackupFailure(t *testing.T) {
	destination := t.TempDir()
	now := time.Date(2026, 9, 16, 12, 59, 30, 0, time.UTC)
	waits := 0
	var delay time.Duration
	agent := backup.Agent{
		Config: backup.Config{DatabasePath: filepath.Join(t.TempDir(), "missing.sqlite"), Destination: destination, Retain: 10, Now: func() time.Time { return now }},
		Wait: func(_ context.Context, duration time.Duration) error {
			waits++
			delay = duration
			return context.Canceled
		},
	}
	if err := agent.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if waits != 1 {
		t.Fatalf("waits = %d", waits)
	}
	if delay != 30*time.Second {
		t.Fatalf("delay = %s, want next UTC boundary", delay)
	}
}

func TestAgentRetriesFailureBeforeNextDistantHour(t *testing.T) {
	destination := t.TempDir()
	now := time.Date(2026, 9, 16, 12, 10, 0, 0, time.UTC)
	var delay time.Duration
	agent := backup.Agent{
		Config: backup.Config{DatabasePath: filepath.Join(t.TempDir(), "missing.sqlite"), Destination: destination, Retain: 10, Now: func() time.Time { return now }},
		Wait: func(_ context.Context, duration time.Duration) error {
			delay = duration
			return context.Canceled
		},
	}
	if err := agent.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if delay != 5*time.Minute {
		t.Fatalf("delay = %s, want failure retry", delay)
	}
}

func TestAgentImmediatelyServicesHourCrossedDuringBackup(t *testing.T) {
	source, _ := preparedDatabase(t)
	destination := t.TempDir()
	before := time.Date(2026, 9, 16, 12, 59, 0, 0, time.UTC)
	after := time.Date(2026, 9, 16, 13, 2, 0, 0, time.UTC)
	calls := 0
	now := func() time.Time {
		calls++
		if calls <= 2 {
			return before
		}
		return after
	}
	waits := 0
	var delay time.Duration
	agent := backup.Agent{
		Config: backup.Config{DatabasePath: source, Destination: destination, Retain: 10, Now: now},
		Wait: func(_ context.Context, duration time.Duration) error {
			waits++
			delay = duration
			return context.Canceled
		},
	}
	if err := agent.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	snapshots, err := backup.List(destination)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshots) != 2 {
		t.Fatalf("snapshots = %d, want one for each crossed UTC hour", len(snapshots))
	}
	if waits != 1 || delay != 58*time.Minute {
		t.Fatalf("waits=%d delay=%s, want one wait until 14:00", waits, delay)
	}
}
