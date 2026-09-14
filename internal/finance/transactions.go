package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type TransactionInput struct {
	CategoryID     string `json:"category_id,omitempty"`
	Kind           string `json:"kind"`
	WalletID       string `json:"wallet_id"`
	ToWalletID     string `json:"to_wallet_id,omitempty"`
	Amount         string `json:"amount"`
	ReceivedAmount string `json:"received_amount,omitempty"`
	Rate           string `json:"rate,omitempty"`
	Date           string `json:"date"`
	Note           string `json:"note"`
	Reason         string `json:"reason"`
}
type Transaction struct {
	TransactionInput
	ID         string `json:"id"`
	Version    int    `json:"version"`
	Voided     bool   `json:"voided"`
	BDTAmount  string `json:"bdt_amount"`
	ActorEmail string `json:"actor_email"`
	CreatedAt  string `json:"created_at"`
}
type effect struct {
	walletID string
	delta    int64
}

func validDate(date string) bool {
	d, e := time.Parse("2006-01-02", date)
	return e == nil && d.Year() >= 1900 && d.Year() <= 9999
}
func (s *Store) CreateTransaction(ctx context.Context, actor, key string, in TransactionInput) (Transaction, error) {
	return write(ctx, s, actor, key, "transaction.create", in, func(tx *sql.Tx) (Transaction, error) { return s.createTransaction(tx, actor, in) })
}
func (s *Store) createTransaction(tx *sql.Tx, actor string, in TransactionInput) (Transaction, error) {
	r, effects, e := s.prepare(tx, in)
	if e != nil {
		return Transaction{}, e
	}
	r.ID = id()
	r.Version = 1
	if _, e = tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, r.ID); e != nil {
		return Transaction{}, e
	}
	return s.saveRevision(tx, actor, r, effects)
}
func (s *Store) prepare(tx *sql.Tx, in TransactionInput) (Transaction, []effect, error) {
	r := Transaction{TransactionInput: in}
	cid, err := categoryID(tx, in.Kind, in.CategoryID)
	if err != nil {
		return r, nil, err
	}
	r.CategoryID = cid
	if !validDate(in.Date) || len(in.Note) > 2000 || len(in.Reason) > 500 {
		return r, nil, ErrInvalid
	}
	if in.Kind != "income" && in.Kind != "expense" && in.Kind != "transfer" {
		return r, nil, ErrInvalid
	}
	w, e := wallet(tx, in.WalletID)
	if e != nil {
		return r, nil, e
	}
	if w.Archived {
		return r, nil, ErrInvalid
	}
	amount, e := ParseMoney(in.Amount)
	if e != nil || amount <= 0 {
		return r, nil, ErrInvalid
	}
	r.Amount = FormatMoney(amount)
	rate := int64(0)
	needsRate := w.Currency == "USD"
	if in.Kind == "transfer" {
		to, e := wallet(tx, in.ToWalletID)
		if e != nil {
			return r, nil, e
		}
		needsRate = needsRate || to.Currency == "USD"
	}
	if in.Rate != "" {
		rate, e = ParseRate(in.Rate)
		if e != nil {
			return r, nil, e
		}
	} else if needsRate {
		set, e := settings(tx)
		if e != nil {
			return r, nil, e
		}
		rate, e = ParseRate(set.Rate)
		if e != nil {
			return r, nil, e
		}
	}
	if rate > 0 {
		r.Rate = FormatRate(rate)
	}
	bdt := amount
	if w.Currency == "USD" {
		bdt, e = Convert(amount, rate, "USD")
		if e != nil {
			return r, nil, e
		}
	}
	r.BDTAmount = FormatMoney(bdt)
	if in.Kind == "transfer" {
		if in.ToWalletID == w.ID {
			return r, nil, ErrInvalid
		}
		to, e := wallet(tx, in.ToWalletID)
		if e != nil {
			return r, nil, e
		}
		if to.Archived {
			return r, nil, ErrInvalid
		}
		received := amount
		if in.ReceivedAmount != "" {
			received, e = ParseMoney(in.ReceivedAmount)
			if e != nil || received <= 0 {
				return r, nil, ErrInvalid
			}
		} else if to.Currency != w.Currency {
			received, e = Convert(amount, rate, w.Currency)
			if e != nil || received <= 0 {
				return r, nil, ErrInvalid
			}
		}
		if to.Currency == w.Currency && received != amount {
			return r, nil, ErrInvalid
		}
		r.ReceivedAmount = FormatMoney(received)
		return r, []effect{{w.ID, -amount}, {to.ID, received}}, nil
	}
	if in.ToWalletID != "" || in.ReceivedAmount != "" {
		return r, nil, ErrInvalid
	}
	delta := amount
	if in.Kind == "expense" {
		delta = -amount
	}
	return r, []effect{{w.ID, delta}}, nil
}
func (s *Store) saveRevision(tx *sql.Tx, actor string, r Transaction, effects []effect) (Transaction, error) {
	r.CreatedAt = s.now().UTC().Format(time.RFC3339Nano)
	if e := tx.QueryRow(`SELECT email FROM users WHERE id=?`, actor).Scan(&r.ActorEmail); e != nil {
		return r, e
	}
	payload, e := json.Marshal(r)
	if e != nil {
		return r, e
	}
	if _, e = tx.Exec(`INSERT INTO transaction_revisions VALUES(?,?,?,?,?)`, r.ID, r.Version, string(payload), actor, r.CreatedAt); e != nil {
		return r, e
	}
	for _, ef := range effects {
		if _, e = tx.Exec(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta) VALUES(?,?,?,?)`, r.ID, r.Version, ef.walletID, ef.delta); e != nil {
			return r, e
		}
		var balance int64
		if e = tx.QueryRow(`SELECT SUM(delta) FROM wallet_entries WHERE wallet_id=?`, ef.walletID).Scan(&balance); e != nil {
			return r, e
		}
		if balance > MaxMoney || balance < -MaxMoney {
			return r, ErrInvalid
		}
		if _, e = tx.Exec(`UPDATE wallets SET version=version+1 WHERE id=?`, ef.walletID); e != nil {
			return r, e
		}
	}
	return r, nil
}
func (s *Store) ReviseTransaction(ctx context.Context, actor, key, tid string, version int, in TransactionInput, void bool) (Transaction, error) {
	request := struct {
		ID      string
		Version int
		Input   TransactionInput
		Void    bool
	}{tid, version, in, void}
	return write(ctx, s, actor, key, "transaction.revise", request, func(tx *sql.Tx) (Transaction, error) {
		old, e := transaction(tx, tid)
		if e != nil {
			return old, e
		}
		if old.Version != version || old.Voided {
			return old, ErrConflict
		}
		if strings.TrimSpace(in.Reason) == "" || len(in.Reason) > 500 || (old.Kind == "opening" || old.Kind == "adjustment") {
			return old, ErrInvalid
		}
		r := old
		var effects []effect
		if !void {
			if in.Rate == "" {
				in.Rate = old.Rate
			}
			if in.Kind != old.Kind {
				return old, ErrInvalid
			}
			r, effects, e = s.prepare(tx, in)
			if e != nil {
				return r, e
			}
		} else {
			r.Reason = in.Reason
			r.Voided = true
		}
		r.ID = tid
		r.Version = version + 1
		if _, e = tx.Exec(`UPDATE transactions SET version=?,voided=? WHERE id=?`, r.Version, void, tid); e != nil {
			return r, e
		}
		r, e = s.saveRevision(tx, actor, r, nil)
		if e != nil {
			return r, e
		}
		rows, e := tx.Query(`SELECT id,wallet_id,delta FROM wallet_entries WHERE transaction_id=? AND version=? AND reversal_of IS NULL`, tid, version)
		if e != nil {
			return r, e
		}
		type oldEffect struct {
			id    int64
			wid   string
			delta int64
		}
		previous := []oldEffect{}
		for rows.Next() {
			var ef oldEffect
			if e = rows.Scan(&ef.id, &ef.wid, &ef.delta); e != nil {
				rows.Close()
				return r, e
			}
			previous = append(previous, ef)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return r, e
		}
		for _, ef := range previous {
			if _, e = tx.Exec(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta,reversal_of) VALUES(?,?,?,?,?)`, tid, r.Version, ef.wid, -ef.delta, ef.id); e != nil {
				return r, e
			}
			if _, e = tx.Exec(`UPDATE wallets SET version=version+1 WHERE id=?`, ef.wid); e != nil {
				return r, e
			}
		}
		for _, ef := range effects {
			if _, e = tx.Exec(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta) VALUES(?,?,?,?)`, tid, r.Version, ef.walletID, ef.delta); e != nil {
				return r, e
			}
			if _, e = tx.Exec(`UPDATE wallets SET version=version+1 WHERE id=?`, ef.walletID); e != nil {
				return r, e
			}
		}
		touched := map[string]bool{}
		for _, ef := range previous {
			touched[ef.wid] = true
		}
		for _, ef := range effects {
			touched[ef.walletID] = true
		}
		for wid := range touched {
			var balance int64
			if e = tx.QueryRow(`SELECT SUM(delta) FROM wallet_entries WHERE wallet_id=?`, wid).Scan(&balance); e != nil {
				return r, e
			}
			if balance > MaxMoney || balance < -MaxMoney {
				return r, ErrInvalid
			}
		}
		if void {
			var bid string
			e = tx.QueryRow(`SELECT id FROM bill_occurrences WHERE transaction_id=?`, tid).Scan(&bid)
			if e == nil {
				if _, e = tx.Exec(`UPDATE bill_occurrences SET status='due',transaction_id=NULL WHERE id=?`, bid); e != nil {
					return r, e
				}
				if e = s.audit(tx, actor, bid, "reopen", map[string]string{"transaction_id": tid}, map[string]string{"status": "due"}); e != nil {
					return r, e
				}
			} else if !errors.Is(e, sql.ErrNoRows) {
				return r, e
			}
		}
		return r, nil
	})
}
func transaction(q querier, tid string) (Transaction, error) {
	var r Transaction
	var body string
	e := q.QueryRow(`SELECT r.payload FROM transactions t JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version WHERE t.id=?`, tid).Scan(&body)
	if errors.Is(e, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	if e != nil {
		return r, e
	}
	e = json.Unmarshal([]byte(body), &r)
	defaultCategory(&r)
	return r, e
}
func (s *Store) History(ctx context.Context, tid string) ([]Transaction, error) {
	rows, e := s.db.QueryContext(ctx, `SELECT r.payload,u.email,r.created_at,r.version FROM transaction_revisions r JOIN users u ON u.id=r.actor_id WHERE transaction_id=? ORDER BY version`, tid)
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
		defaultCategory(&r)
		r.Version = version
		r.ActorEmail = email
		r.CreatedAt = created
		out = append(out, r)
	}
	if len(out) == 0 {
		return nil, ErrNotFound
	}
	return out, rows.Err()
}
func (s *Store) Transactions(ctx context.Context, limit, offset int) ([]Transaction, error) {
	if limit < 1 || limit > 200 || offset < 0 {
		return nil, ErrInvalid
	}
	rows, e := s.db.QueryContext(ctx, `SELECT r.payload,t.id,r.version,u.email,r.created_at FROM transactions t JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version JOIN users u ON u.id=r.actor_id ORDER BY json_extract(r.payload,'$.date') DESC,r.created_at DESC,t.id LIMIT ? OFFSET ?`, limit, offset)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Transaction{}
	for rows.Next() {
		var r Transaction
		var body, tid, email, created string
		var version int
		if e = rows.Scan(&body, &tid, &version, &email, &created); e != nil {
			return nil, e
		}
		if e = json.Unmarshal([]byte(body), &r); e != nil {
			return nil, e
		}
		r.ID = tid
		defaultCategory(&r)
		r.Version = version
		r.ActorEmail = email
		r.CreatedAt = created
		out = append(out, r)
	}
	return out, rows.Err()
}
