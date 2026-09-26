package finance

import (
	"context"
	"embed"
	"fmt"
)

//go:embed seeds/*.sql
var seeds embed.FS

func (s *Store) Seed(ctx context.Context) error {
	_, err := change(ctx, s, func(tx dbtx) (struct{}, error) {
		files, err := seeds.ReadDir("seeds")
		if err != nil {
			return struct{}{}, err
		}
		for _, file := range files {
			body, err := seeds.ReadFile("seeds/" + file.Name())
			if err != nil {
				return struct{}{}, err
			}
			if _, err = tx.Exec(string(body)); err != nil {
				return struct{}{}, fmt.Errorf("seed %s (run migrate first): %w", file.Name(), err)
			}
		}
		return struct{}{}, nil
	})
	return err
}
