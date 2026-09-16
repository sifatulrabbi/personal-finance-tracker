package backup

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

const DefaultSuccessFile = "/tmp/simply-finance-backup-success"

const failureRetryDelay = 5 * time.Minute

type Agent struct {
	Config      Config
	SuccessFile string
	Logf        func(string, ...any)
	Wait        func(context.Context, time.Duration) error
}

// Run backs up immediately and then wakes at each UTC hour boundary. Individual
// backup failures are logged and retried in the next hour.
func (agent Agent) Run(ctx context.Context) error {
	if agent.Config.Now == nil {
		agent.Config.Now = time.Now
	}
	if agent.SuccessFile == "" {
		agent.SuccessFile = DefaultSuccessFile
	}
	if agent.Logf == nil {
		agent.Logf = func(string, ...any) {}
	}
	if agent.Wait == nil {
		agent.Wait = wait
	}
	for {
		started := agent.Config.Now().UTC()
		snapshot, created, err := CreateForCurrentHour(ctx, agent.Config)
		failed := err != nil
		if err != nil {
			agent.Logf("backup failed: %v", err)
		} else {
			if healthErr := writeSuccessFile(agent.SuccessFile, started); healthErr != nil {
				failed = true
				agent.Logf("backup succeeded but health state update failed: %v", healthErr)
			} else if created {
				agent.Logf("backup succeeded path=%s size_bytes=%d duration=%s", snapshot.Path, snapshot.Size, agent.Config.Now().UTC().Sub(started))
			} else {
				agent.Logf("backup already exists for UTC hour=%s", started.Truncate(time.Hour).Format(time.RFC3339))
			}
		}
		now := agent.Config.Now().UTC()
		if now.Truncate(time.Hour).After(started.Truncate(time.Hour)) {
			continue
		}
		delay := now.Truncate(time.Hour).Add(time.Hour).Sub(now)
		if delay <= 0 {
			delay = time.Hour
		}
		if failed && delay > failureRetryDelay {
			delay = failureRetryDelay
		}
		if err = agent.Wait(ctx, delay); err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return nil
			}
			return err
		}
	}
}

func wait(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func writeSuccessFile(path string, instant time.Time) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	temporary := path + ".partial"
	if err := os.WriteFile(temporary, []byte(instant.UTC().Format(time.RFC3339Nano)+"\n"), 0600); err != nil {
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		os.Remove(temporary)
		return fmt.Errorf("publish health state: %w", err)
	}
	return nil
}
