package sqlite

import (
	"encoding/json"
	"strings"

	"simply-finance/internal/app"
	"simply-finance/internal/ledger"
)

// listSelect reads each record's current revision. The order is date, then the current revision's
// instant and write position, newest first; (date, created_at, seq) is unique, so a cursor naming
// the last item seen is an exact position.
const (
	listSelect = `SELECT r.payload,t.id,t.version,t.voided,u.email,r.created_at,t.date,t.created_at,t.seq FROM transactions t JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version JOIN users u ON u.id=r.actor_id`
	listOrder  = ` ORDER BY t.date DESC,t.created_at DESC,t.seq DESC`
)

// Transaction reads one record's current revision with its author and revision time.
func (tx records) Transaction(id string) (ledger.Transaction, error) {
	items, _, e := tx.listTransactions(listSelect+` WHERE t.id=?`, id)
	if e != nil {
		return ledger.Transaction{}, e
	}
	if len(items) == 0 {
		return ledger.Transaction{}, ledger.ErrNotFound
	}
	return items[0], nil
}

// RecentTransactions lists every record, voided ones included, in list order.
func (tx records) RecentTransactions(limit, offset int) ([]ledger.Transaction, error) {
	items, _, e := tx.listTransactions(listSelect+listOrder+` LIMIT ? OFFSET ?`, limit, offset)
	return items, e
}

// TransactionPage lists at most limit records matching f, after the position after when it is not
// nil, with each record's list position.
func (tx records) TransactionPage(f app.TransactionFilter, after *app.TransactionCursor, limit int) ([]ledger.Transaction, []app.TransactionCursor, error) {
	where, args := []string{}, []any{}
	if f.Kind != "" {
		where, args = append(where, `t.kind=?`), append(args, f.Kind)
	}
	if f.CategoryID != "" {
		where, args = append(where, `t.category_id=?`), append(args, f.CategoryID)
	}
	if f.From != "" {
		where, args = append(where, `t.date>=?`), append(args, f.From)
	}
	if f.To != "" {
		where, args = append(where, `t.date<=?`), append(args, f.To)
	}
	if !f.IncludeVoided {
		where = append(where, `t.voided=0`)
	}
	if after != nil {
		where, args = append(where, `(t.date,t.created_at,t.seq)<(?,?,?)`), append(args, after.Date, after.CreatedAt, after.Seq)
	}
	query, queryArgs := listSelect, args
	if len(where) > 0 {
		query += ` WHERE ` + strings.Join(where, ` AND `)
	}
	if f.WalletID != "" {
		var e error
		if query, queryArgs, e = tx.walletQuery(f.WalletID, where, args, limit); e != nil {
			return nil, nil, e
		}
	}
	return tx.listTransactions(query+listOrder+` LIMIT ?`, append(queryArgs, limit)...)
}

// walletQuery lists the records naming walletID, or for a bank wallet also its linked debit cards,
// as source or destination. One ordered, limited scan per wallet and column, each an index range in
// list order, keeps a page cheap for a busy wallet and a quiet one alike; a single OR across the
// columns made SQLite gather and sort every record of the wallet.
func (tx records) walletQuery(walletID string, where []string, args []any, limit int) (string, []any, error) {
	rows, e := tx.Query(`SELECT id FROM wallets WHERE id=? OR bank_wallet_id=? ORDER BY id`, walletID, walletID)
	if e != nil {
		return "", nil, e
	}
	named, e := collect(rows, func(row scanner) (string, error) {
		var id string
		e := row.Scan(&id)
		return id, e
	})
	if e != nil {
		return "", nil, e
	}
	if len(named) == 0 {
		named = append(named, walletID) // An unknown wallet lists nothing.
	}
	parts, all := []string{}, []any{}
	for _, id := range named {
		for _, column := range []string{"t.wallet_id", "t.to_wallet_id"} {
			scan := `SELECT t.id FROM transactions t WHERE ` + strings.Join(append([]string{column + `=?`}, where...), ` AND `) + listOrder + ` LIMIT ?`
			parts = append(parts, `SELECT id FROM (`+scan+`)`)
			all = append(append(append(all, id), args...), limit)
		}
	}
	return listSelect + ` WHERE t.id IN (` + strings.Join(parts, ` UNION ALL `) + `)`, all, nil
}

// listTransactions runs a listSelect query and returns the records with their list positions.
func (tx records) listTransactions(query string, args ...any) ([]ledger.Transaction, []app.TransactionCursor, error) {
	rows, e := tx.Query(query, args...)
	if e != nil {
		return nil, nil, e
	}
	defer rows.Close()
	out, keys := []ledger.Transaction{}, []app.TransactionCursor{}
	for rows.Next() {
		var r ledger.Transaction
		var body string
		var key app.TransactionCursor
		if e = rows.Scan(&body, &r.ID, &r.Version, &r.Voided, &r.ActorEmail, &r.CreatedAt, &key.Date, &key.CreatedAt, &key.Seq); e != nil {
			return nil, nil, e
		}
		id, version, voided, email, created := r.ID, r.Version, r.Voided, r.ActorEmail, r.CreatedAt
		if e = json.Unmarshal([]byte(body), &r); e != nil {
			return nil, nil, e
		}
		ledger.DefaultCategory(&r)
		// The row, not the payload, is authoritative: opening payloads were stored without these.
		r.ID, r.Version, r.Voided, r.ActorEmail, r.CreatedAt = id, version, voided, email, created
		out, keys = append(out, r), append(keys, key)
	}
	return out, keys, rows.Err()
}
