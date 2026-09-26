package app

import (
	"context"
	"encoding/json"

	"simply-finance/internal/ledger"
)

func (s *Service) CreateTransaction(ctx context.Context, actor, key string, in ledger.TransactionInput) (ledger.Transaction, error) {
	return write(ctx, s, actor, key, "transaction.create", in, func(tx Tx) (ledger.Transaction, error) {
		return s.createTransaction(tx, actor, in)
	})
}

func (s *Service) createTransaction(tx Tx, actor string, in ledger.TransactionInput) (ledger.Transaction, error) {
	r, effects, facts, e := prepare(tx, in)
	if e != nil {
		return ledger.Transaction{}, e
	}
	if e = ledger.CheckNamedWallets(in, nil, facts.From, facts.To); e != nil {
		return ledger.Transaction{}, e
	}
	if e = keepArchivedBalances(tx, nil, effects, ledger.ArchivedNewRecord); e != nil {
		return ledger.Transaction{}, e
	}
	r.ID = newID()
	r.Version = 1
	if e = tx.InsertTransaction(r.ID); e != nil {
		return ledger.Transaction{}, e
	}
	return s.saveRevision(tx, actor, r, nil, effects)
}

// prepare loads the records an income, expense, or transfer names and applies the ledger rules.
func prepare(tx Tx, in ledger.TransactionInput) (ledger.Transaction, []ledger.Effect, ledger.RecordFacts, error) {
	var f ledger.RecordFacts
	var e error
	if cid, err := ledger.ResolveCategory(in.Kind, in.CategoryID); err == nil && cid != "" {
		if f.CategoryFound, e = tx.CategoryExists(cid, in.Kind); e != nil {
			return ledger.Transaction{}, nil, f, e
		}
	}
	if f.From, e = findWallet(tx, in.WalletID); e != nil {
		return ledger.Transaction{}, nil, f, e
	}
	if in.Kind == "transfer" {
		if f.To, e = findWallet(tx, in.ToWalletID); e != nil {
			return ledger.Transaction{}, nil, f, e
		}
	}
	set, e := tx.Settings()
	if e != nil {
		return ledger.Transaction{}, nil, f, e
	}
	f.DefaultRate = set.Rate
	r, effects, e := ledger.PrepareRecord(in, f)
	return r, effects, f, e
}

// keepArchivedBalances rejects a change that would move the balance of an archived wallet the
// record names (see ledger.BalanceChanges). A new record may not use an archived wallet at all; a
// correction may keep one when its balance stays the same (note, date, category, or a USD rate
// that only changes the BDT value).
func keepArchivedBalances(tx Tx, before, after []ledger.Effect, message string) error {
	for _, c := range ledger.BalanceChanges(before, after) {
		w, e := tx.Wallet(c.WalletID)
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
func (s *Service) saveRevision(tx Tx, actor string, r ledger.Transaction, previous []Entry, effects []ledger.Effect) (ledger.Transaction, error) {
	r.CreatedAt = s.instant()
	var e error
	if r.ActorEmail, e = tx.UserEmail(actor); e != nil {
		return r, e
	}
	payload, e := json.Marshal(r)
	if e != nil {
		return r, e
	}
	if e = tx.WriteRevision(Revision{TransactionID: r.ID, Version: r.Version, Voided: r.Voided, Payload: payload, ActorID: actor, CreatedAt: r.CreatedAt}); e != nil {
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
		if e = tx.Post(r.ID, r.Version, en.WalletID, -en.Delta, en.ID); e != nil {
			return r, e
		}
		touch(en.WalletID)
	}
	for _, ef := range effects {
		if e = tx.Post(r.ID, r.Version, ef.WalletID, ef.Delta, 0); e != nil {
			return r, e
		}
		touch(ef.WalletID)
	}
	for _, wid := range touched {
		balance, e := tx.WalletBalance(wid)
		if e != nil {
			return r, e
		}
		if e = ledger.CheckBalance(balance); e != nil {
			return r, e
		}
	}
	return r, nil
}

// ReviseTransaction corrects (void false) or voids a record at its current version. A correction
// reverses the prior revision's entries and posts the corrected effects; a void only reverses them
// and reopens a bill the record paid.
func (s *Service) ReviseTransaction(ctx context.Context, actor, key, tid string, version int, in ledger.TransactionInput, void bool) (ledger.Transaction, error) {
	request := struct {
		ID      string
		Version int
		Input   ledger.TransactionInput
		Void    bool
	}{tid, version, in, void}
	return write(ctx, s, actor, key, "transaction.revise", request, func(tx Tx) (ledger.Transaction, error) {
		old, e := tx.Transaction(tid)
		if e != nil {
			return old, e
		}
		if e = ledger.CheckRevisable(old, version, void, in.Reason); e != nil {
			return old, e
		}
		previous, e := tx.CurrentEntries(tid, version)
		if e != nil {
			return old, e
		}
		if void {
			return s.voidTransaction(tx, actor, old, in.Reason, previous)
		}
		return s.correctTransaction(tx, actor, old, in, previous)
	})
}

func (s *Service) correctTransaction(tx Tx, actor string, old ledger.Transaction, in ledger.TransactionInput, previous []Entry) (ledger.Transaction, error) {
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

func (s *Service) voidTransaction(tx Tx, actor string, old ledger.Transaction, reason string, previous []Entry) (ledger.Transaction, error) {
	r := ledger.Void(old, reason)
	r.Version = old.Version + 1
	r, e := s.saveRevision(tx, actor, r, previous, nil)
	if e != nil {
		return r, e
	}
	bid, found, e := tx.BillPaidBy(old.ID)
	if e != nil || !found {
		return r, e
	}
	if e = tx.ReopenBill(bid); e != nil {
		return r, e
	}
	return r, tx.Audit(actor, bid, "reopen", map[string]string{"transaction_id": old.ID}, map[string]string{"status": "due"}, s.instant())
}

// Transaction reads one record's current revision with its author and revision time.
func (s *Service) Transaction(ctx context.Context, tid string) (ledger.Transaction, error) {
	return read(ctx, s, func(tx Tx) (ledger.Transaction, error) { return tx.Transaction(tid) })
}

// History reads every preserved revision of a record, oldest first, with its author.
func (s *Service) History(ctx context.Context, tid string) ([]ledger.Transaction, error) {
	return read(ctx, s, func(tx Tx) ([]ledger.Transaction, error) { return tx.History(tid) })
}
