package finance

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"simply-finance/internal/ledger"
	"strings"
)

// TransactionFilter narrows a transaction list. Empty fields do not filter. WalletID matches records
// that name the wallet as source or destination; for a bank wallet it also matches records made
// with its linked debit cards, because those move the bank wallet's balance (ADR 0011). From and
// To are inclusive YYYY-MM-DD dates. Voided records are left out unless IncludeVoided is set.
type TransactionFilter struct {
	WalletID      string
	Kind          string
	CategoryID    string
	From          string
	To            string
	IncludeVoided bool
}

// TransactionPage is one page of a cursor-paged list. NextCursor is nil on the last page.
type TransactionPage struct {
	Items      []Transaction `json:"items"`
	NextCursor *string       `json:"next_cursor"`
}

// AuditPage is one page of the change log, newest first.
type AuditPage struct {
	Items      []AuditEvent `json:"items"`
	NextCursor *string      `json:"next_cursor"`
}

// listSelect reads each record's current revision. The order is date, then the current revision's
// instant and write position, newest first; (date, created_at, seq) is unique, so a cursor naming
// the last item seen is an exact position.
const (
	listSelect = `SELECT r.payload,t.id,t.version,t.voided,u.email,r.created_at,t.date,t.created_at,t.seq FROM transactions t JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version JOIN users u ON u.id=r.actor_id`
	listOrder  = ` ORDER BY t.date DESC,t.created_at DESC,t.seq DESC`
)

type transactionCursor struct {
	Date      string `json:"d"`
	CreatedAt string `json:"c"`
	Seq       int64  `json:"s"`
}

var errCursor = ledger.Invalid("cursor", "This cursor is not valid. Start again from the first page.")

// encodeCursor makes an opaque, URL-safe cursor from a sort key.
func encodeCursor(key any) *string {
	raw, _ := json.Marshal(key)
	out := base64.RawURLEncoding.EncodeToString(raw)
	return &out
}
func decodeCursor(cursor string, key any) error {
	raw, e := base64.RawURLEncoding.DecodeString(cursor)
	if e != nil || len(raw) > 512 {
		return errCursor
	}
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if dec.Decode(key) != nil {
		return errCursor
	}
	return nil
}

func validLimit(limit int) error {
	if limit < 1 || limit > 200 {
		return ledger.Invalid("limit", "Use a limit from 1 to 200.")
	}
	return nil
}

var transactionKinds = map[string]bool{"income": true, "expense": true, "transfer": true, "opening": true, "adjustment": true}

// TransactionsPage lists current records newest first, limit at a time. An empty cursor starts at
// the newest record; a page's NextCursor continues after its last item. The position is a sort key,
// not an offset, so records added while paging never repeat or displace records not yet seen. A
// record corrected while paging moves to its new position, as it would in a fresh list.
func (s *Store) TransactionsPage(ctx context.Context, f TransactionFilter, cursor string, limit int) (TransactionPage, error) {
	out := TransactionPage{Items: []Transaction{}}
	if e := validLimit(limit); e != nil {
		return out, e
	}
	where, args := []string{}, []any{}
	if f.Kind != "" {
		if !transactionKinds[f.Kind] {
			return out, ledger.Invalid("kind", "Choose income, expense, transfer, opening, or adjustment.")
		}
		where, args = append(where, `t.kind=?`), append(args, f.Kind)
	}
	if f.CategoryID != "" {
		where, args = append(where, `t.category_id=?`), append(args, f.CategoryID)
	}
	if f.From != "" {
		if !ledger.ValidDate(f.From) {
			return out, ledger.Invalid("from", "Enter a date as YYYY-MM-DD.")
		}
		where, args = append(where, `t.date>=?`), append(args, f.From)
	}
	if f.To != "" {
		if !ledger.ValidDate(f.To) || (f.From != "" && f.To < f.From) {
			return out, ledger.Invalid("to", "Enter a date as YYYY-MM-DD, on or after from.")
		}
		where, args = append(where, `t.date<=?`), append(args, f.To)
	}
	if !f.IncludeVoided {
		where = append(where, `t.voided=0`)
	}
	if cursor != "" {
		var key transactionCursor
		if decodeCursor(cursor, &key) != nil || !ledger.ValidDate(key.Date) || key.CreatedAt == "" || key.Seq <= 0 {
			return out, errCursor
		}
		where, args = append(where, `(t.date,t.created_at,t.seq)<(?,?,?)`), append(args, key.Date, key.CreatedAt, key.Seq)
	}
	return read(ctx, s, func(tx dbtx) (TransactionPage, error) {
		query, queryArgs := listSelect, args
		if len(where) > 0 {
			query += ` WHERE ` + strings.Join(where, ` AND `)
		}
		if f.WalletID != "" {
			var e error
			if query, queryArgs, e = walletQuery(tx, f.WalletID, where, args, limit+1); e != nil {
				return out, e
			}
		}
		items, keys, e := listTransactions(tx, query+listOrder+` LIMIT ?`, append(queryArgs, limit+1)...)
		if e != nil {
			return out, e
		}
		if len(items) > limit {
			items, keys = items[:limit], keys[:limit]
			out.NextCursor = encodeCursor(keys[limit-1])
		}
		out.Items = items
		return out, nil
	})
}

// walletQuery lists the records naming walletID, or for a bank wallet also its linked debit cards,
// as source or destination. One ordered, limited scan per wallet and column, each an index range in
// list order, keeps a page cheap for a busy wallet and a quiet one alike; a single OR across the
// columns made SQLite gather and sort every record of the wallet.
func walletQuery(tx dbtx, walletID string, where []string, args []any, limit int) (string, []any, error) {
	rows, e := tx.Query(`SELECT id FROM wallets WHERE id=? OR bank_wallet_id=? ORDER BY id`, walletID, walletID)
	if e != nil {
		return "", nil, e
	}
	named := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return "", nil, e
		}
		named = append(named, id)
	}
	e = rows.Err()
	rows.Close()
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

// listTransactions runs a listSelect query and returns the records with their sort keys.
func listTransactions(tx dbtx, query string, args ...any) ([]Transaction, []transactionCursor, error) {
	rows, e := tx.Query(query, args...)
	if e != nil {
		return nil, nil, e
	}
	defer rows.Close()
	out, keys := []Transaction{}, []transactionCursor{}
	for rows.Next() {
		var r Transaction
		var body string
		var key transactionCursor
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

// Transactions is the deprecated offset list: every record, voided ones included, in list order.
// Deep offsets cost more with history; new clients use TransactionsPage.
func (s *Store) Transactions(ctx context.Context, limit, offset int) ([]Transaction, error) {
	if e := validPage(limit, offset); e != nil {
		return nil, e
	}
	return read(ctx, s, func(tx dbtx) ([]Transaction, error) { return recentTransactions(tx, limit, offset) })
}
func recentTransactions(tx dbtx, limit, offset int) ([]Transaction, error) {
	items, _, e := listTransactions(tx, listSelect+listOrder+` LIMIT ? OFFSET ?`, limit, offset)
	return items, e
}

type auditCursor struct {
	ID int64 `json:"id"`
}

// AuditPage lists change-log events newest first, limit at a time, continuing after cursor.
func (s *Store) AuditPage(ctx context.Context, cursor string, limit int) (AuditPage, error) {
	out := AuditPage{Items: []AuditEvent{}}
	if e := validLimit(limit); e != nil {
		return out, e
	}
	clause, args := ``, []any{}
	if cursor != "" {
		var key auditCursor
		if decodeCursor(cursor, &key) != nil || key.ID <= 0 {
			return out, errCursor
		}
		clause, args = `WHERE a.id<? `, append(args, key.ID)
	}
	return read(ctx, s, func(tx dbtx) (AuditPage, error) {
		items, e := auditEvents(tx, clause+`ORDER BY a.id DESC LIMIT ?`, append(args, limit+1)...)
		if e != nil {
			return out, e
		}
		if len(items) > limit {
			items = items[:limit]
			out.NextCursor = encodeCursor(auditCursor{items[limit-1].ID})
		}
		out.Items = items
		return out, nil
	})
}
