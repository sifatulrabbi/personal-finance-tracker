package finance

import (
	"context"
	"database/sql"
	"strings"
)

type CategoryInput struct {
	Name string `json:"name"`
	Type string `json:"type"`
}
type Category struct {
	CategoryInput
	ID string `json:"id"`
}

func (s *Store) Categories(ctx context.Context) ([]Category, error) {
	rows, e := s.db.QueryContext(ctx, `SELECT id,type,name FROM categories ORDER BY type,name,id`)
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
}
func (s *Store) CreateCategory(ctx context.Context, actor, key string, in CategoryInput) (Category, error) {
	return write(ctx, s, actor, key, "category.create", in, func(tx *sql.Tx) (Category, error) {
		out := Category{CategoryInput: in, ID: id()}
		if (in.Type != "income" && in.Type != "expense") || strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 {
			return out, ErrInvalid
		}
		var count int
		if e := tx.QueryRow(`SELECT count(*) FROM categories WHERE type=? AND name=?`, in.Type, in.Name).Scan(&count); e != nil {
			return out, e
		}
		if count != 0 {
			return out, ErrConflict
		}
		if _, e := tx.Exec(`INSERT INTO categories(id,type,name) VALUES(?,?,?)`, out.ID, out.Type, out.Name); e != nil {
			return out, e
		}
		return out, s.audit(tx, actor, out.ID, "category.create", nil, out)
	})
}
func categoryID(q querier, kind, cid string) (string, error) {
	if kind != "income" && kind != "expense" {
		if cid != "" {
			return "", ErrInvalid
		}
		return "", nil
	}
	if cid == "" {
		cid = "others-" + kind
	}
	var count int
	if e := q.QueryRow(`SELECT count(*) FROM categories WHERE id=? AND type=?`, cid, kind).Scan(&count); e != nil {
		return "", e
	}
	if count != 1 {
		return "", ErrInvalid
	}
	return cid, nil
}
func defaultCategory(r *Transaction) {
	if r.CategoryID == "" && (r.Kind == "income" || r.Kind == "expense") {
		r.CategoryID = "others-" + r.Kind
	}
}
