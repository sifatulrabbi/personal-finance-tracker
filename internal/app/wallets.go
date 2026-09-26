package app

import (
	"context"
	"encoding/json"

	"simply-finance/internal/ledger"
)

// CreateWallet adds a wallet and records its opening balance as a transaction. A linked debit
// card has no balance of its own and records none.
func (s *Service) CreateWallet(ctx context.Context, actor, key string, in ledger.WalletInput) (ledger.Wallet, error) {
	return write(ctx, s, actor, key, "wallet.create", in, func(tx Tx) (ledger.Wallet, error) {
		var bank *ledger.Wallet
		if in.CardType == "debit" && in.BankWalletID != "" {
			var e error
			if bank, e = findWallet(tx, in.BankWalletID); e != nil {
				return ledger.Wallet{}, e
			}
		}
		nw, e := ledger.ValidateNewWallet(in, bank)
		if e != nil {
			return ledger.Wallet{}, e
		}
		wid := newID()
		if e = tx.InsertWallet(wid, nw.Input, nw.CreditLimit); e != nil {
			return ledger.Wallet{}, e
		}
		if nw.HasOpening {
			if e = s.recordOpening(tx, actor, wid, nw); e != nil {
				return ledger.Wallet{}, e
			}
		}
		w, e := tx.Wallet(wid)
		if e != nil {
			return w, e
		}
		return w, tx.Audit(actor, wid, "create", nil, w, s.instant())
	})
}

// recordOpening stores a new wallet's opening balance transaction and its entry.
func (s *Service) recordOpening(tx Tx, actor, wid string, nw ledger.NewWallet) error {
	tid := newID()
	if e := tx.InsertTransaction(tid); e != nil {
		return e
	}
	payload, e := json.Marshal(ledger.OpeningPayload(wid, nw.OpeningAmount, s.today()))
	if e != nil {
		return e
	}
	if e = tx.WriteRevision(Revision{TransactionID: tid, Version: 1, Payload: payload, ActorID: actor, CreatedAt: s.instant()}); e != nil {
		return e
	}
	return tx.Post(tid, 1, wid, nw.OpeningEffect, 0)
}

func (s *Service) Wallet(ctx context.Context, wid string) (ledger.Wallet, error) {
	return read(ctx, s, func(tx Tx) (ledger.Wallet, error) { return tx.Wallet(wid) })
}

func (s *Service) Wallets(ctx context.Context) ([]ledger.Wallet, error) {
	return read(ctx, s, func(tx Tx) ([]ledger.Wallet, error) { return tx.Wallets() })
}

// AdjustWallet records the difference to a target balance. balanceVersion is the wallet's
// BalanceVersion as read, so the target is refused if any balance effect happened since.
func (s *Service) AdjustWallet(ctx context.Context, actor, key, wid string, balanceVersion int, target, reason string) (ledger.Transaction, error) {
	return write(ctx, s, actor, key, "wallet.adjust", struct {
		ID             string
		Version        int
		Target, Reason string
	}{wid, balanceVersion, target, reason}, func(tx Tx) (ledger.Transaction, error) {
		w, e := tx.Wallet(wid)
		if e != nil {
			return ledger.Transaction{}, e
		}
		r, effects, e := ledger.Adjustment(w, balanceVersion, target, reason, s.today())
		if e != nil {
			return r, e
		}
		r.ID = newID()
		if e = tx.InsertTransaction(r.ID); e != nil {
			return r, e
		}
		return s.saveRevision(tx, actor, r, nil, effects)
	})
}

// UpdateWallet edits a wallet's metadata. Only the editable fields and the identity form the
// request fingerprint, so a retry that echoes refreshed read-only fields (balance, versions) still
// replays instead of reporting a reused key.
func (s *Service) UpdateWallet(ctx context.Context, actor, key string, in ledger.Wallet) (ledger.Wallet, error) {
	request := struct {
		ID, Name, Type, CardType, Currency, Details, CreditLimit, BankWalletID string
		Archived                                                               bool
		Version                                                                int
	}{in.ID, in.Name, in.Type, in.CardType, in.Currency, in.Details, in.CreditLimit, in.BankWalletID, in.Archived, in.Version}
	return write(ctx, s, actor, key, "wallet.update", request, func(tx Tx) (ledger.Wallet, error) {
		old, e := tx.Wallet(in.ID)
		if e != nil {
			return old, e
		}
		limit, e := ledger.ValidateWalletUpdate(old, in)
		if e != nil {
			return old, e
		}
		if e = tx.UpdateWallet(in.ID, in.Name, in.Details, limit, in.Archived); e != nil {
			return old, e
		}
		out, e := tx.Wallet(in.ID)
		if e != nil {
			return out, e
		}
		return out, tx.Audit(actor, in.ID, "update", old, out, s.instant())
	})
}
