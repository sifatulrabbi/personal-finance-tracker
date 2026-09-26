package finance

import (
	"context"
	"encoding/json"
	"strings"
)

// AdjustWallet records the difference to a target balance. balanceVersion is the wallet's
// BalanceVersion as read, so the target is refused if any balance effect happened since.
func (s *Store) AdjustWallet(ctx context.Context, actor, key, wid string, balanceVersion int, target, reason string) (Transaction, error) {
	return write(ctx, s, actor, key, "wallet.adjust", struct {
		ID             string
		Version        int
		Target, Reason string
	}{wid, balanceVersion, target, reason}, func(tx dbtx) (Transaction, error) {
		var r Transaction
		w, e := wallet(tx, wid)
		if e != nil {
			return r, e
		}
		if w.BalanceVersion != balanceVersion {
			return r, ErrStaleVersion
		}
		if w.Archived {
			return r, archived("", "This wallet is archived. Unarchive it before adjusting its balance.")
		}
		if w.CardType == "debit" && !w.legacyDebit() {
			return r, invalid("", "A debit card has no balance of its own. Adjust its bank wallet instead.")
		}
		if strings.TrimSpace(reason) == "" || len(reason) > 500 {
			return r, invalid("reason", "Enter a reason of at most 500 bytes.")
		}
		desired, e := ParseMoney(target)
		if e != nil {
			return r, invalid("balance", "Enter a balance with at most two decimal places.")
		}
		if w.CardType == "credit" {
			desired = -desired
		}
		if w.legacyDebit() && desired != 0 {
			return r, invalid("balance", "This debit card is not linked to a bank wallet. It can only be adjusted to zero.")
		}
		delta := desired - w.balance
		if delta == 0 {
			return r, invalid("balance", "The wallet already has this balance.")
		}
		if delta > MaxMoney || delta < -MaxMoney {
			return r, invalid("balance", "This adjustment is larger than the supported limit.")
		}
		r = Transaction{ID: id(), Version: 1, TransactionInput: TransactionInput{Kind: "adjustment", WalletID: wid, Amount: FormatMoney(delta), Date: s.today(), Reason: reason, Note: "Balance set to " + FormatMoney(mustMoney(target))}}
		if _, e = tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, r.ID); e != nil {
			return r, e
		}
		return s.saveRevision(tx, actor, r, []effect{{wid, delta, "wallet_id"}})
	})
}
func mustMoney(s string) int64 { n, _ := ParseMoney(s); return n }

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
		if old.Version != in.Version {
			return old, ErrStaleVersion
		}
		if e = validWalletText(in.Name, in.Details); e != nil {
			return old, e
		}
		for _, f := range []struct{ field, got, want string }{{"type", in.Type, old.Type}, {"card_type", in.CardType, old.CardType}, {"currency", in.Currency, old.Currency}, {"bank_wallet_id", in.BankWalletID, old.BankWalletID}} {
			if f.got != f.want {
				return old, invalid(f.field, "A wallet's type, card type, currency, and bank link cannot change.")
			}
		}
		limit, e := ParseMoney(in.CreditLimit)
		if e != nil || limit < 0 {
			return old, invalid("credit_limit", "Enter a credit limit of zero or more, with at most two decimal places.")
		}
		if old.CardType != "credit" && limit != 0 {
			return old, invalid("credit_limit", "Only credit cards have a credit limit.")
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

type AuditEvent struct {
	ID         int64           `json:"id"`
	ActorEmail string          `json:"actor_email"`
	EntityID   string          `json:"entity_id"`
	Action     string          `json:"action"`
	Before     json.RawMessage `json:"before"`
	After      json.RawMessage `json:"after"`
	CreatedAt  string          `json:"created_at"`
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
