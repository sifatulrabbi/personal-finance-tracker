package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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
	var r Transaction
	if e := json.Unmarshal([]byte(payload), &r); e != nil {
		return currentColumns{}, e
	}
	defaultCategory(&r)
	c := currentColumns{Kind: r.Kind, Date: r.Date, WalletID: r.WalletID}
	c.ToWalletID = sql.NullString{String: r.ToWalletID, Valid: r.ToWalletID != ""}
	c.CategoryID = sql.NullString{String: r.CategoryID, Valid: r.CategoryID != ""}
	if r.BDTAmount != "" {
		n, e := ParseMoney(r.BDTAmount)
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

// writeRevision stores revision version of an existing transaction row and makes it current: the
// payload is kept as evidence, and the row's version, voided flag, and typed columns are replaced
// in the same transaction. seq takes the next write position, so the list order stays unique.
func writeRevision(tx dbtx, tid string, version int, voided bool, payload []byte, actor, createdAt string) error {
	c, e := columnsOf(string(payload))
	if e != nil {
		return e
	}
	if _, e = tx.Exec(`INSERT INTO transaction_revisions VALUES(?,?,?,?,?)`, tid, version, string(payload), actor, createdAt); e != nil {
		return e
	}
	_, e = tx.Exec(`UPDATE transactions SET version=?,voided=?,kind=?,date=?,wallet_id=?,to_wallet_id=?,category_id=?,bdt_minor=?,created_at=?,seq=(SELECT COALESCE(MAX(seq),0)+1 FROM transactions) WHERE id=?`,
		version, voided, c.Kind, c.Date, c.WalletID, c.ToWalletID, c.CategoryID, c.BDTMinor, createdAt, tid)
	return e
}

// post appends one wallet entry for a revision; reversalOf is the entry it reverses, or zero. The
// entry trigger adds delta to the wallet's cached balance, and the balance version changes so a
// pending adjustment computed from the old balance is refused.
func post(tx dbtx, tid string, version int, walletID string, delta, reversalOf int64) error {
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

// balanceWithinLimit reads a wallet's cached balance after its entries were posted.
func balanceWithinLimit(tx dbtx, walletID string) error {
	var balance int64
	if e := tx.QueryRow(`SELECT balance_minor FROM wallets WHERE id=?`, walletID).Scan(&balance); e != nil {
		return e
	}
	if balance > MaxMoney || balance < -MaxMoney {
		return errBalanceLimit
	}
	return nil
}

// verifyDerived checks every derived value against its source: each transaction's typed columns
// against its current revision payload and instant, and each wallet's cached balance against the
// sum of its entries. It returns the first difference.
func verifyDerived(tx dbtx) error {
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
	_, e := read(ctx, s, func(tx dbtx) (struct{}, error) { return struct{}{}, verifyDerived(tx) })
	return e
}
