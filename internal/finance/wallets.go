package finance

import (
	"context"
	"encoding/json"

	"simply-finance/internal/ledger"
)

func (s *Store) CreateWallet(ctx context.Context, actor, key string, in WalletInput) (Wallet, error) {
	return write(ctx, s, actor, key, "wallet.create", in, func(tx dbtx) (Wallet, error) {
		var bank *Wallet
		if in.CardType == "debit" && in.BankWalletID != "" {
			var e error
			if bank, e = findWallet(tx, in.BankWalletID); e != nil {
				return Wallet{}, e
			}
		}
		nw, e := ledger.ValidateNewWallet(in, bank)
		if e != nil {
			return Wallet{}, e
		}
		in = nw.Input
		wid := id()
		var bankID any
		if in.BankWalletID != "" {
			bankID = in.BankWalletID
		}
		if _, e = tx.Exec(`INSERT INTO wallets(id,name,type,card_type,currency,details,credit_limit,bank_wallet_id) VALUES(?,?,?,?,?,?,?,?)`, wid, in.Name, in.Type, in.CardType, in.Currency, in.Details, nw.CreditLimit, bankID); e != nil {
			return Wallet{}, e
		}
		if nw.HasOpening {
			tid := id()
			if _, e = tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, tid); e != nil {
				return Wallet{}, e
			}
			payload, _ := json.Marshal(ledger.OpeningPayload(wid, nw.OpeningAmount, s.today()))
			if e = writeRevision(tx, tid, 1, false, payload, actor, s.instant()); e != nil {
				return Wallet{}, e
			}
			if e = post(tx, tid, 1, wid, nw.OpeningEffect, 0); e != nil {
				return Wallet{}, e
			}
		}
		w, e := wallet(tx, wid)
		if e != nil {
			return w, e
		}
		return w, s.audit(tx, actor, wid, "create", nil, w)
	})
}

func (s *Store) Wallet(ctx context.Context, wid string) (Wallet, error) {
	return read(ctx, s, func(tx dbtx) (Wallet, error) { return wallet(tx, wid) })
}
func (s *Store) Wallets(ctx context.Context) ([]Wallet, error) { return read(ctx, s, wallets) }

// AdjustWallet records the difference to a target balance. balanceVersion is the wallet's
// BalanceVersion as read, so the target is refused if any balance effect happened since.
func (s *Store) AdjustWallet(ctx context.Context, actor, key, wid string, balanceVersion int, target, reason string) (Transaction, error) {
	return write(ctx, s, actor, key, "wallet.adjust", struct {
		ID             string
		Version        int
		Target, Reason string
	}{wid, balanceVersion, target, reason}, func(tx dbtx) (Transaction, error) {
		w, e := wallet(tx, wid)
		if e != nil {
			return Transaction{}, e
		}
		r, effects, e := ledger.Adjustment(w, balanceVersion, target, reason, s.today())
		if e != nil {
			return r, e
		}
		r.ID = id()
		if _, e = tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, r.ID); e != nil {
			return r, e
		}
		return s.saveRevision(tx, actor, r, nil, effects)
	})
}

// UpdateWallet edits a wallet's metadata. Only the editable fields and the identity form the
// request fingerprint, so a retry that echoes refreshed read-only fields (balance, versions) still
// replays instead of reporting a reused key.
func (s *Store) UpdateWallet(ctx context.Context, actor, key string, in Wallet) (Wallet, error) {
	request := struct {
		ID, Name, Type, CardType, Currency, Details, CreditLimit, BankWalletID string
		Archived                                                               bool
		Version                                                                int
	}{in.ID, in.Name, in.Type, in.CardType, in.Currency, in.Details, in.CreditLimit, in.BankWalletID, in.Archived, in.Version}
	return write(ctx, s, actor, key, "wallet.update", request, func(tx dbtx) (Wallet, error) {
		old, e := wallet(tx, in.ID)
		if e != nil {
			return old, e
		}
		limit, e := ledger.ValidateWalletUpdate(old, in)
		if e != nil {
			return old, e
		}
		if _, e = tx.Exec(`UPDATE wallets SET name=?,details=?,credit_limit=?,archived=?,version=version+1 WHERE id=?`, in.Name, in.Details, limit, in.Archived, in.ID); e != nil {
			return old, e
		}
		out, e := wallet(tx, in.ID)
		if e != nil {
			return out, e
		}
		return out, s.audit(tx, actor, in.ID, "update", old, out)
	})
}

// Audit is the deprecated offset list of the change log; new clients use AuditPage.
func (s *Store) Audit(ctx context.Context, limit, offset int) ([]AuditEvent, error) {
	if e := validPage(limit, offset); e != nil {
		return nil, e
	}
	return read(ctx, s, func(tx dbtx) ([]AuditEvent, error) {
		return auditEvents(tx, `ORDER BY a.id DESC LIMIT ? OFFSET ?`, limit, offset)
	})
}

// auditEvents reads change-log events; tail holds the query's WHERE, ORDER BY, and LIMIT clauses.
func auditEvents(tx dbtx, tail string, args ...any) ([]AuditEvent, error) {
	rows, e := tx.Query(`SELECT a.id,u.email,a.entity_id,a.action,a.before_json,a.after_json,a.created_at FROM audit_events a JOIN users u ON u.id=a.actor_id `+tail, args...)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []AuditEvent{}
	for rows.Next() {
		var a AuditEvent
		var before, after string
		if e = rows.Scan(&a.ID, &a.ActorEmail, &a.EntityID, &a.Action, &before, &after, &a.CreatedAt); e != nil {
			return nil, e
		}
		a.Before = json.RawMessage(before)
		a.After = json.RawMessage(after)
		out = append(out, a)
	}
	return out, rows.Err()
}
