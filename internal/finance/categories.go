package finance

import (
	"context"
	"simply-finance/internal/ledger"
)

func (s *Store) Categories(ctx context.Context) ([]Category, error) {
	return read(ctx, s, func(tx dbtx) ([]Category, error) {
		rows, e := tx.Query(`SELECT id,type,name FROM categories ORDER BY type,name,id`)
		if e != nil {
			return nil, e
		}
		defer rows.Close()
		out := []Category{}
		for rows.Next() {
			var c Category
			if e = rows.Scan(&c.ID, &c.Type, &c.Name); e != nil {
				return nil, e
			}
			out = append(out, c)
		}
		return out, rows.Err()
	})
}
func (s *Store) CreateCategory(ctx context.Context, actor, key string, in CategoryInput) (Category, error) {
	return write(ctx, s, actor, key, "category.create", in, func(tx dbtx) (Category, error) {
		out := Category{CategoryInput: in, ID: id()}
		if e := ledger.ValidateCategory(in); e != nil {
			return out, e
		}
		var count int
		if e := tx.QueryRow(`SELECT count(*) FROM categories WHERE type=? AND name=?`, in.Type, in.Name).Scan(&count); e != nil {
			return out, e
		}
		if count != 0 {
			return out, ErrDuplicateName
		}
		if _, e := tx.Exec(`INSERT INTO categories(id,type,name) VALUES(?,?,?)`, out.ID, out.Type, out.Name); e != nil {
			return out, e
		}
		return out, s.audit(tx, actor, out.ID, "category.create", nil, out)
	})
}
