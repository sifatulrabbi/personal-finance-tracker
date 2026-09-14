package finance

import (
	"context"
	"database/sql"
)

type Settings struct {
	Rate            string `json:"rate"`
	Version         int    `json:"version"`
	Timezone        string `json:"timezone"`
	DefaultCurrency string `json:"default_currency"`
}

func settings(q querier) (Settings, error) {
	out := Settings{Timezone: "Asia/Dhaka", DefaultCurrency: "BDT"}
	var rate sql.NullInt64
	e := q.QueryRow(`SELECT rate,version FROM settings WHERE id=1`).Scan(&rate, &out.Version)
	if rate.Valid {
		out.Rate = FormatRate(rate.Int64)
	}
	return out, e
}
func (s *Store) Settings(ctx context.Context) (Settings, error) { return settings(s.db) }
func (s *Store) SetRate(ctx context.Context, actor, key, rate string, version int) (Settings, error) {
	return write(ctx, s, actor, key, "settings.rate", struct {
		Rate    string
		Version int
	}{rate, version}, func(tx *sql.Tx) (Settings, error) {
		old, e := settings(tx)
		if e != nil {
			return old, e
		}
		if old.Version != version {
			return old, ErrConflict
		}
		n, e := ParseRate(rate)
		if e != nil {
			return old, e
		}
		if _, e = tx.Exec(`UPDATE settings SET rate=?,version=version+1 WHERE id=1`, n); e != nil {
			return old, e
		}
		out, e := settings(tx)
		if e != nil {
			return out, e
		}
		return out, s.audit(tx, actor, "settings", "rate", old, out)
	})
}
