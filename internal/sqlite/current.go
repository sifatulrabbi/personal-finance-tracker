package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"simply-finance/internal/app"
	"simply-finance/internal/ledger"
	"simply-finance/internal/money"
)

// currentColumns are the queryable facts of a transaction's current revision, stored as typed
// columns on its transactions row (ADR 0012). They are always derived from the revision payload by
// columnsOf, both when a revision is written and when the stored state is checked.
type currentColumns struct {
	Kind, Date, WalletID string
	ToWalletID           sql.NullString
	CategoryID           sql.NullString
	BDTMinor             sql.NullInt64
}

// columnsOf reads a stored revision payload the way every read does: a legacy income or expense
// without a category belongs to its type's Others, and an absent BDT value stays absent. The
// payload's own id and version are ignored; opening payloads never had them.
func columnsOf(payload string) (currentColumns, error) {
	var r ledger.Transaction
	if e := json.Unmarshal([]byte(payload), &r); e != nil {
		return currentColumns{}, e
	}
	ledger.DefaultCategory(&r)
	c := currentColumns{Kind: r.Kind, Date: r.Date, WalletID: r.WalletID}
	c.ToWalletID = sql.NullString{String: r.ToWalletID, Valid: r.ToWalletID != ""}
	c.CategoryID = sql.NullString{String: r.CategoryID, Valid: r.CategoryID != ""}
	if r.BDTAmount != "" {
		n, e := money.ParseMoney(r.BDTAmount)
		if e != nil {
			return c, fmt.Errorf("bdt_amount %q: %w", r.BDTAmount, e)
		}
		c.BDTMinor = sql.NullInt64{Int64: n, Valid: true}
	}
	if c.Kind == "" || c.Date == "" || c.WalletID == "" {
		return c, errors.New("payload lacks kind, date, or wallet_id")
	}
	return c, nil
}

// InsertTransaction adds a record's row at version 1; WriteRevision then fills its current state.
func (tx records) InsertTransaction(id string) error {
	_, e := tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, id)
	return e
}

// WriteRevision stores a revision of an existing transaction row and makes it current: the
// payload is kept as evidence, and the row's version, voided flag, and typed columns are replaced
// in the same transaction. seq takes the next write position, so the list order stays unique.
func (tx records) WriteRevision(r app.Revision) error {
	c, e := columnsOf(string(r.Payload))
	if e != nil {
		return e
	}
	if _, e = tx.Exec(`INSERT INTO transaction_revisions VALUES(?,?,?,?,?)`, r.TransactionID, r.Version, string(r.Payload), r.ActorID, r.CreatedAt); e != nil {
		return e
	}
	_, e = tx.Exec(`UPDATE transactions SET version=?,voided=?,kind=?,date=?,wallet_id=?,to_wallet_id=?,category_id=?,bdt_minor=?,created_at=?,seq=(SELECT COALESCE(MAX(seq),0)+1 FROM transactions) WHERE id=?`,
		r.Version, r.Voided, c.Kind, c.Date, c.WalletID, c.ToWalletID, c.CategoryID, c.BDTMinor, r.CreatedAt, r.TransactionID)
	return e
}

// Post appends one wallet entry for a revision; reversalOf is the entry it reverses, or zero. The
// entry trigger adds delta to the wallet's cached balance, and the balance version changes so a
// pending adjustment computed from the old balance is refused. This is the only statement that
// changes a balance or its version.
func (tx records) Post(tid string, version int, walletID string, delta, reversalOf int64) error {
	var reverses any
	if reversalOf != 0 {
		reverses = reversalOf
	}
	if _, e := tx.Exec(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta,reversal_of) VALUES(?,?,?,?,?)`, tid, version, walletID, delta, reverses); e != nil {
		return e
	}
	_, e := tx.Exec(`UPDATE wallets SET balance_version=balance_version+1 WHERE id=?`, walletID)
	return e
}

// CurrentEntries returns the wallet entries a revision applied, which a correction or void reverses.
func (tx records) CurrentEntries(tid string, version int) ([]app.Entry, error) {
	// The unary + keeps SQLite from answering "reversal_of IS NULL" with the UNIQUE index on
	// reversal_of, which it takes to match one row but which matches nearly every entry.
	rows, e := tx.Query(`SELECT id,wallet_id,delta FROM wallet_entries WHERE transaction_id=? AND version=? AND +reversal_of IS NULL`, tid, version)
	if e != nil {
		return nil, e
	}
	return collect(rows, func(row scanner) (app.Entry, error) {
		var en app.Entry
		e := row.Scan(&en.ID, &en.WalletID, &en.Delta)
		return en, e
	})
}

// History reads every revision of a record, oldest first, with its author.
func (tx records) History(tid string) ([]ledger.Transaction, error) {
	rows, e := tx.Query(`SELECT r.payload,u.email,r.created_at,r.version FROM transaction_revisions r JOIN users u ON u.id=r.actor_id WHERE transaction_id=? ORDER BY version`, tid)
	if e != nil {
		return nil, e
	}
	out, e := collect(rows, func(row scanner) (ledger.Transaction, error) {
		var r ledger.Transaction
		var body, email, created string
		var version int
		if e := row.Scan(&body, &email, &created, &version); e != nil {
			return r, e
		}
		if e := json.Unmarshal([]byte(body), &r); e != nil {
			return r, e
		}
		ledger.DefaultCategory(&r)
		r.ID, r.Version, r.ActorEmail, r.CreatedAt = tid, version, email, created
		return r, nil
	})
	if e != nil {
		return nil, e
	}
	if len(out) == 0 {
		return nil, ledger.ErrNotFound
	}
	return out, nil
}

// verifyDerived checks every derived value against its source: each transaction's typed columns
// against its current revision payload and instant, and each wallet's cached balance against the
// sum of its entries. It returns the first difference.
func (tx records) verifyDerived() error {
	rows, e := tx.Query(`SELECT t.id,r.payload,r.created_at,t.kind,t.date,t.wallet_id,t.to_wallet_id,t.category_id,t.bdt_minor,t.created_at,t.seq FROM transactions t LEFT JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version ORDER BY t.id`)
	if e != nil {
		return e
	}
	defer rows.Close()
	for rows.Next() {
		var tid string
		var payload, revised sql.NullString
		var got currentColumns
		var created string
		var seq int64
		if e = rows.Scan(&tid, &payload, &revised, &got.Kind, &got.Date, &got.WalletID, &got.ToWalletID, &got.CategoryID, &got.BDTMinor, &created, &seq); e != nil {
			return e
		}
		if !payload.Valid {
			return fmt.Errorf("transaction %s has no current revision", tid)
		}
		want, e := columnsOf(payload.String)
		if e != nil {
			return fmt.Errorf("transaction %s: %w", tid, e)
		}
		if got != want || created != revised.String || seq <= 0 {
			return fmt.Errorf("transaction %s: stored columns %+v (%s, seq %d) differ from its revision %+v (%s)", tid, got, created, seq, want, revised.String)
		}
	}
	if e = rows.Err(); e != nil {
		return e
	}
	var wid string
	e = tx.QueryRow(`SELECT id FROM wallets w WHERE balance_minor<>COALESCE((SELECT SUM(delta) FROM wallet_entries WHERE wallet_id=w.id),0) LIMIT 1`).Scan(&wid)
	if e == nil {
		return fmt.Errorf("wallet %s: cached balance differs from the sum of its entries", wid)
	}
	if !errors.Is(e, sql.ErrNoRows) {
		return e
	}
	return nil
}

// VerifyDerivedState reports whether every stored derived value (transaction columns and cached
// wallet balances) still equals the value derived from its source records.
func (s *Store) VerifyDerivedState(ctx context.Context) error {
	return run(ctx, s.reader, &sql.TxOptions{ReadOnly: true}, func(tx records) error { return tx.verifyDerived() })
}

// derivedStateMigration is the first migration after which every derived value exists.
const derivedStateMigration = "012_wallet_balance_cache.sql"

// VerifySnapshot opens a backup read-only, without switching its journal mode, and checks its
// derived state, so a restore drill proves the balance cache and typed columns, not only pages.
// A snapshot taken before those columns existed has nothing derived to check and passes.
func VerifySnapshot(ctx context.Context, path string) error {
	abs, e := filepath.Abs(path)
	if e != nil {
		return e
	}
	u := url.URL{Scheme: "file", Path: abs}
	q := u.Query()
	q.Set("mode", "ro")
	u.RawQuery = q.Encode()
	db, e := sql.Open("sqlite", u.String())
	if e != nil {
		return e
	}
	defer db.Close()
	var applied int
	if e = db.QueryRowContext(ctx, `SELECT count(*) FROM schema_migrations WHERE name=?`, derivedStateMigration).Scan(&applied); e != nil {
		return fmt.Errorf("read applied migrations: %w", e)
	}
	if applied == 0 {
		return nil
	}
	return run(ctx, db, &sql.TxOptions{ReadOnly: true}, func(tx records) error { return tx.verifyDerived() })
}
