package finance

import (
	"context"
	"embed"
	"fmt"
)

//go:embed seeds/*.sql
var seeds embed.FS

func (s *Store) Seed(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	files, err := seeds.ReadDir("seeds")
	if err != nil {
		return err
	}
	for _, file := range files {
		body, err := seeds.ReadFile("seeds/" + file.Name())
		if err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, string(body)); err != nil {
			return fmt.Errorf("seed %s (run migrate first): %w", file.Name(), err)
		}
	}
	return tx.Commit()
}
