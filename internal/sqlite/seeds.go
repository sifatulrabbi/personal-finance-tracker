package sqlite

import (
	"context"
	"embed"
	"fmt"
)

//go:embed seeds/*.sql
var seeds embed.FS

// Seed runs every repeatable default-data insert in one transaction. Each seed must stay safe to
// rerun: there is no applied-seed ledger (ADR 0006).
func (s *Store) Seed(ctx context.Context) error {
	return run(ctx, s.writer, nil, func(tx records) error {
		files, err := seeds.ReadDir("seeds")
		if err != nil {
			return err
		}
		for _, file := range files {
			body, err := seeds.ReadFile("seeds/" + file.Name())
			if err != nil {
				return err
			}
			if _, err = tx.Exec(string(body)); err != nil {
				return fmt.Errorf("seed %s (run migrate first): %w", file.Name(), err)
			}
		}
		return nil
	})
}
