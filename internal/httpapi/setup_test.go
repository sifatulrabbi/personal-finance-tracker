package httpapi_test

import (
	"context"
	"simply-finance/internal/finance"
	"testing"
	"time"
)

func openPrepared(t *testing.T, path string, now func() time.Time) (*finance.Store, error) {
	t.Helper()
	if err := finance.Migrate(path); err != nil {
		return nil, err
	}
	s, err := finance.Open(path, now)
	if err != nil {
		return nil, err
	}
	if err = s.Seed(context.Background()); err != nil {
		s.Close()
		return nil, err
	}
	return s, nil
}
