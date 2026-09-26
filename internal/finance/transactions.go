package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"simply-finance/internal/ledger"
)

func validPage(limit, offset int) error {
	if limit < 1 || limit > 200 {
		return ledger.Invalid("limit", "Use a limit from 1 to 200.")
	}
	if offset < 0 {
		return ledger.Invalid("offset", "Use an offset of zero or more.")
	}
	return nil
}

func (s *Store) CreateTransaction(ctx context.Context, actor, key string, in TransactionInput) (Transaction, error) {
	return write(ctx, s, actor, key, "transaction.create", in, func(tx dbtx) (Transaction, error) { return s.createTransaction(tx, actor, in) })
}
func (s *Store) createTransaction(tx dbtx, actor string, in TransactionInput) (Transaction, error) {
	r, effects, facts, e := prepare(tx, in)
	if e != nil {
		return Transaction{}, e
	}
	if e = ledger.CheckNamedWallets(in, nil, facts.From, facts.To); e != nil {
		return Transaction{}, e
	}
	if e = keepArchivedBalances(tx, nil, effects, ledger.ArchivedNewRecord); e != nil {
		return Transaction{}, e
	}
	r.ID = id()
	r.Version = 1
	if _, e = tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, r.ID); e != nil {
		return Transaction{}, e
	}
	return s.saveRevision(tx, actor, r, nil, effects)
}

// prepare loads the records an income, expense, or transfer names and applies the ledger rules.
func prepare(tx dbtx, in TransactionInput) (Transaction, []ledger.Effect, ledger.RecordFacts, error) {
	var f ledger.RecordFacts
	var e error
	if cid, err := ledger.ResolveCategory(in.Kind, in.CategoryID); err == nil && cid != "" {
		if f.CategoryFound, e = categoryExists(tx, cid, in.Kind); e != nil {
			return Transaction{}, nil, f, e
		}
	}
	if f.From, e = findWallet(tx, in.WalletID); e != nil {
		return Transaction{}, nil, f, e
	}
	if in.Kind == "transfer" {
		if f.To, e = findWallet(tx, in.ToWalletID); e != nil {
			return Transaction{}, nil, f, e
		}
	}
	set, e := settings(tx)
	if e != nil {
		return Transaction{}, nil, f, e
	}
	f.DefaultRate = set.Rate
	r, effects, e := ledger.PrepareRecord(in, f)
	return r, effects, f, e
}

// keepArchivedBalances rejects a change that would move the balance of an archived wallet the
// record names (see ledger.BalanceChanges). A new record may not use an archived wallet at all; a
// correction may keep one when its balance stays the same (note, date, category, or a USD rate
// that only changes the BDT value).
func keepArchivedBalances(tx dbtx, before, after []ledger.Effect, message string) error {
	for _, c := range ledger.BalanceChanges(before, after) {
		w, e := wallet(tx, c.WalletID)
		if e != nil {
			return e
		}
		if w.Archived {
			return ledger.Archived(c.Field, message)
		}
	}
	return nil
}

// saveRevision stores r as its transaction's current revision and applies its balance effects in
// the same transaction: it reverses the entries the previous revision posted (none for a new
// record), posts the new effects, and then checks every wallet it touched stays within the
// balance limit.
func (s *Store) saveRevision(tx dbtx, actor string, r Transaction, previous []entry, effects []ledger.Effect) (Transaction, error) {
	r.CreatedAt = s.instant()
	if e := tx.QueryRow(`SELECT email FROM users WHERE id=?`, actor).Scan(&r.ActorEmail); e != nil {
		return r, e
	}
	payload, e := json.Marshal(r)
	if e != nil {
		return r, e
	}
	if e = writeRevision(tx, r.ID, r.Version, r.Voided, payload, actor, r.CreatedAt); e != nil {
		return r, e
	}
	touched := []string{}
	seen := map[string]bool{}
	touch := func(wid string) {
		if !seen[wid] {
			seen[wid] = true
			touched = append(touched, wid)
		}
	}
	for _, en := range previous {
		if e = post(tx, r.ID, r.Version, en.WalletID, -en.Delta, en.ID); e != nil {
			return r, e
		}
		touch(en.WalletID)
	}
	for _, ef := range effects {
		if e = post(tx, r.ID, r.Version, ef.WalletID, ef.Delta, 0); e != nil {
			return r, e
		}
		touch(ef.WalletID)
	}
	for _, wid := range touched {
		if e = balanceWithinLimit(tx, wid); e != nil {
			return r, e
		}
	}
	return r, nil
}

// ReviseTransaction corrects (void false) or voids a record at its current version. A correction
// reverses the prior revision's entries and posts the corrected effects; a void only reverses them
// and reopens a bill the record paid.
func (s *Store) ReviseTransaction(ctx context.Context, actor, key, tid string, version int, in TransactionInput, void bool) (Transaction, error) {
	request := struct {
		ID      string
		Version int
		Input   TransactionInput
		Void    bool
	}{tid, version, in, void}
	return write(ctx, s, actor, key, "transaction.revise", request, func(tx dbtx) (Transaction, error) {
		old, e := transaction(tx, tid)
		if e != nil {
			return old, e
		}
		if e = ledger.CheckRevisable(old, version, void, in.Reason); e != nil {
			return old, e
		}
		previous, e := currentEntries(tx, tid, version)
		if e != nil {
			return old, e
		}
		if void {
			return s.voidTransaction(tx, actor, old, in.Reason, previous)
		}
		return s.correctTransaction(tx, actor, old, in, previous)
	})
}

func (s *Store) correctTransaction(tx dbtx, actor string, old Transaction, in TransactionInput, previous []entry) (Transaction, error) {
	in, e := ledger.CorrectionInput(old, in)
	if e != nil {
		return old, e
	}
	r, effects, facts, e := prepare(tx, in)
	if e != nil {
		return r, e
	}
	if e = ledger.CheckNamedWallets(in, &old, facts.From, facts.To); e != nil {
		return old, e
	}
	before := make([]ledger.Effect, len(previous))
	for i, en := range previous {
		before[i] = en.Effect
	}
	if e = keepArchivedBalances(tx, before, effects, ledger.ArchivedCorrection); e != nil {
		return old, e
	}
	r.ID, r.Version = old.ID, old.Version+1
	return s.saveRevision(tx, actor, r, previous, effects)
}

func (s *Store) voidTransaction(tx dbtx, actor string, old Transaction, reason string, previous []entry) (Transaction, error) {
	r := ledger.Void(old, reason)
	r.Version = old.Version + 1
	r, e := s.saveRevision(tx, actor, r, previous, nil)
	if e != nil {
		return r, e
	}
	var bid string
	e = tx.QueryRow(`SELECT id FROM bill_occurrences WHERE transaction_id=?`, old.ID).Scan(&bid)
	if errors.Is(e, sql.ErrNoRows) {
		return r, nil
	}
	if e != nil {
		return r, e
	}
	if _, e = tx.Exec(`UPDATE bill_occurrences SET status='due',transaction_id=NULL WHERE id=?`, bid); e != nil {
		return r, e
	}
	return r, s.audit(tx, actor, bid, "reopen", map[string]string{"transaction_id": old.ID}, map[string]string{"status": "due"})
}

// entry is a posted wallet entry that a correction or void reverses.
type entry struct {
	ID int64
	ledger.Effect
}

// currentEntries returns the wallet entries a revision applied, which a correction or void reverses.
func currentEntries(tx dbtx, tid string, version int) ([]entry, error) {
	// The unary + keeps SQLite from answering "reversal_of IS NULL" with the UNIQUE index on
	// reversal_of, which it takes to match one row but which matches nearly every entry.
	rows, e := tx.Query(`SELECT id,wallet_id,delta FROM wallet_entries WHERE transaction_id=? AND version=? AND +reversal_of IS NULL`, tid, version)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []entry{}
	for rows.Next() {
		var en entry
		if e = rows.Scan(&en.ID, &en.WalletID, &en.Delta); e != nil {
			return nil, e
		}
		out = append(out, en)
	}
	return out, rows.Err()
}
func transaction(q querier, tid string) (Transaction, error) {
	var r Transaction
	var body string
	var version int
	var voided bool
	e := q.QueryRow(`SELECT r.payload,t.version,t.voided FROM transactions t JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version WHERE t.id=?`, tid).Scan(&body, &version, &voided)
	if errors.Is(e, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	if e != nil {
		return r, e
	}
	e = json.Unmarshal([]byte(body), &r)
	ledger.DefaultCategory(&r)
	// The row, not the payload, is authoritative: opening payloads were stored without a version.
	r.ID, r.Version, r.Voided = tid, version, voided
	return r, e
}
func (s *Store) History(ctx context.Context, tid string) ([]Transaction, error) {
	return read(ctx, s, func(tx dbtx) ([]Transaction, error) {
		rows, e := tx.Query(`SELECT r.payload,u.email,r.created_at,r.version FROM transaction_revisions r JOIN users u ON u.id=r.actor_id WHERE transaction_id=? ORDER BY version`, tid)
		if e != nil {
			return nil, e
		}
		defer rows.Close()
		out := []Transaction{}
		for rows.Next() {
			var r Transaction
			var body, email, created string
			var version int
			if e = rows.Scan(&body, &email, &created, &version); e != nil {
				return nil, e
			}
			if e = json.Unmarshal([]byte(body), &r); e != nil {
				return nil, e
			}
			r.ID = tid
			ledger.DefaultCategory(&r)
			r.Version = version
			r.ActorEmail = email
			r.CreatedAt = created
			out = append(out, r)
		}
		if e = rows.Err(); e != nil {
			return nil, e
		}
		if len(out) == 0 {
			return nil, ErrNotFound
		}
		return out, nil
	})
}
