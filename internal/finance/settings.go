package finance

import (
	"context"
	"database/sql"
	"simply-finance/internal/ledger"
	"simply-finance/internal/money"
)

func settings(q querier) (Settings, error) {
	out := Settings{Timezone: "Asia/Dhaka", DefaultCurrency: "BDT"}
	var rate sql.NullInt64
	e := q.QueryRow(`SELECT rate,version FROM settings WHERE id=1`).Scan(&rate, &out.Version)
	if rate.Valid {
		out.Rate = money.FormatRate(rate.Int64)
	}
	return out, e
}
func (s *Store) Settings(ctx context.Context) (Settings, error) {
	return read(ctx, s, func(tx dbtx) (Settings, error) { return settings(tx) })
}
func (s *Store) SetRate(ctx context.Context, actor, key, rate string, version int) (Settings, error) {
	return write(ctx, s, actor, key, "settings.rate", struct {
		Rate    string
		Version int
	}{rate, version}, func(tx dbtx) (Settings, error) {
		old, e := settings(tx)
		if e != nil {
			return old, e
		}
		n, e := ledger.ParseRateChange(old, version, rate)
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
