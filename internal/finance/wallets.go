package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

func (s *Store) AdjustWallet(ctx context.Context, actor, key, wid string, version int, target, reason string) (Transaction, error) {
	return write(ctx, s, actor, key, "wallet.adjust", struct {
		ID             string
		Version        int
		Target, Reason string
	}{wid, version, target, reason}, func(tx *sql.Tx) (Transaction, error) {
		var r Transaction
		w, e := wallet(tx, wid)
		if e != nil {
			return r, e
		}
		if w.Version != version {
			return r, ErrConflict
		}
		if w.Archived || strings.TrimSpace(reason) == "" || len(reason) > 500 {
			return r, ErrInvalid
		}
		desired, e := ParseMoney(target)
		if e != nil {
			return r, e
		}
		if w.CardType == "credit" {
			desired = -desired
		}
		var current int64
		if e = tx.QueryRow(`SELECT COALESCE(SUM(delta),0) FROM wallet_entries WHERE wallet_id=?`, wid).Scan(&current); e != nil {
			return r, e
		}
		delta := desired - current
		if delta > MaxMoney || delta < -MaxMoney || delta == 0 {
			return r, ErrInvalid
		}
		r = Transaction{ID: id(), Version: 1, TransactionInput: TransactionInput{Kind: "adjustment", WalletID: wid, Amount: FormatMoney(delta), Date: s.today(), Reason: reason, Note: "Balance set to " + FormatMoney(mustMoney(target))}}
		if _, e = tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, r.ID); e != nil {
			return r, e
		}
		return s.saveRevision(tx, actor, r, []effect{{wid, delta}})
	})
}
func mustMoney(s string) int64 { n, _ := ParseMoney(s); return n }
func (s *Store) UpdateWallet(ctx context.Context, actor, key string, in Wallet) (Wallet, error) {
	return write(ctx, s, actor, key, "wallet.update", in, func(tx *sql.Tx) (Wallet, error) {
		old, e := wallet(tx, in.ID)
		if e != nil {
			return old, e
		}
		if old.Version != in.Version {
			return old, ErrConflict
		}
		if strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 || len(in.Details) > 2000 || in.Type != old.Type || in.CardType != old.CardType || in.Currency != old.Currency {
			return old, ErrInvalid
		}
		limit, e := ParseMoney(in.CreditLimit)
		if e != nil || limit < 0 || (old.CardType != "credit" && limit != 0) {
			return old, ErrInvalid
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

func (s *Store) Audit(ctx context.Context, limit, offset int) ([]AuditEvent, error) {
	if limit < 1 || limit > 200 || offset < 0 {
		return nil, ErrInvalid
	}
	rows, e := s.db.QueryContext(ctx, `SELECT a.id,u.email,a.entity_id,a.action,a.before_json,a.after_json,a.created_at FROM audit_events a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT ? OFFSET ?`, limit, offset)
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
