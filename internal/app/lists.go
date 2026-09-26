package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"

	"simply-finance/internal/ledger"
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
	Items      []ledger.Transaction `json:"items"`
	NextCursor *string              `json:"next_cursor"`
}

// AuditPage is one page of the change log, newest first.
type AuditPage struct {
	Items      []ledger.AuditEvent `json:"items"`
	NextCursor *string             `json:"next_cursor"`
}

// TransactionCursor is a transaction's position in list order: date, then the current revision's
// instant and write position, newest first. The three together are unique, so a cursor naming the
// last item seen is an exact position.
type TransactionCursor struct {
	Date      string `json:"d"`
	CreatedAt string `json:"c"`
	Seq       int64  `json:"s"`
}

type auditCursor struct {
	ID int64 `json:"id"`
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

// validFilter checks a transaction filter's kind and dates.
func validFilter(f TransactionFilter) error {
	if f.Kind != "" && !transactionKinds[f.Kind] {
		return ledger.Invalid("kind", "Choose income, expense, transfer, opening, or adjustment.")
	}
	if f.From != "" && !ledger.ValidDate(f.From) {
		return ledger.Invalid("from", "Enter a date as YYYY-MM-DD.")
	}
	if f.To != "" && (!ledger.ValidDate(f.To) || (f.From != "" && f.To < f.From)) {
		return ledger.Invalid("to", "Enter a date as YYYY-MM-DD, on or after from.")
	}
	return nil
}

// TransactionsPage lists current records newest first, limit at a time. An empty cursor starts at
// the newest record; a page's NextCursor continues after its last item. The position is a sort key,
// not an offset, so records added while paging never repeat or displace records not yet seen. A
// record corrected while paging moves to its new position, as it would in a fresh list.
func (s *Service) TransactionsPage(ctx context.Context, f TransactionFilter, cursor string, limit int) (TransactionPage, error) {
	out := TransactionPage{Items: []ledger.Transaction{}}
	if e := validLimit(limit); e != nil {
		return out, e
	}
	if e := validFilter(f); e != nil {
		return out, e
	}
	var after *TransactionCursor
	if cursor != "" {
		var key TransactionCursor
		if decodeCursor(cursor, &key) != nil || !ledger.ValidDate(key.Date) || key.CreatedAt == "" || key.Seq <= 0 {
			return out, errCursor
		}
		after = &key
	}
	return read(ctx, s, func(tx Tx) (TransactionPage, error) {
		items, keys, e := tx.TransactionPage(f, after, limit+1)
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

// Transactions is the deprecated offset list: every record, voided ones included, in list order.
// Deep offsets cost more with history; new clients use TransactionsPage.
func (s *Service) Transactions(ctx context.Context, limit, offset int) ([]ledger.Transaction, error) {
	if e := validPage(limit, offset); e != nil {
		return nil, e
	}
	return read(ctx, s, func(tx Tx) ([]ledger.Transaction, error) { return tx.RecentTransactions(limit, offset) })
}

// Audit is the deprecated offset list of the change log; new clients use AuditPage.
func (s *Service) Audit(ctx context.Context, limit, offset int) ([]ledger.AuditEvent, error) {
	if e := validPage(limit, offset); e != nil {
		return nil, e
	}
	return read(ctx, s, func(tx Tx) ([]ledger.AuditEvent, error) { return tx.AuditEvents(0, limit, offset) })
}

// AuditPage lists change-log events newest first, limit at a time, continuing after cursor.
func (s *Service) AuditPage(ctx context.Context, cursor string, limit int) (AuditPage, error) {
	out := AuditPage{Items: []ledger.AuditEvent{}}
	if e := validLimit(limit); e != nil {
		return out, e
	}
	var before int64
	if cursor != "" {
		var key auditCursor
		if decodeCursor(cursor, &key) != nil || key.ID <= 0 {
			return out, errCursor
		}
		before = key.ID
	}
	return read(ctx, s, func(tx Tx) (AuditPage, error) {
		items, e := tx.AuditEvents(before, limit+1, 0)
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
