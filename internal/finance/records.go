package finance

import (
	"database/sql"
	"errors"
	"time"

	"simply-finance/internal/ledger"
)

type querier interface {
	QueryRow(query string, args ...any) *sql.Row
}

type scanner interface{ Scan(dest ...any) error }

const walletColumns = `id,name,type,card_type,currency,details,credit_limit,archived,version,balance_version,COALESCE(bank_wallet_id,''),balance_minor`

// scanWallet reads one row of walletColumns. The balance is the cached sum of the wallet's own
// entries (ADR 0012), so a linked debit card, which posts to its bank wallet, reports zero.
func scanWallet(row scanner) (Wallet, error) {
	var w Wallet
	var limit, balance int64
	if e := row.Scan(&w.ID, &w.Name, &w.Type, &w.CardType, &w.Currency, &w.Details, &limit, &w.Archived, &w.Version, &w.BalanceVersion, &w.BankWalletID, &balance); e != nil {
		return w, e
	}
	w.SetAmounts(limit, balance)
	return w, nil
}

func wallet(q querier, wid string) (Wallet, error) {
	w, e := scanWallet(q.QueryRow(`SELECT `+walletColumns+` FROM wallets WHERE id=?`, wid))
	if errors.Is(e, sql.ErrNoRows) {
		return w, ErrNotFound
	}
	return w, e
}

// findWallet loads a wallet a rule needs, or nil when it does not exist.
func findWallet(q querier, wid string) (*Wallet, error) {
	w, e := wallet(q, wid)
	if errors.Is(e, ErrNotFound) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	return &w, nil
}

func wallets(tx dbtx) ([]Wallet, error) {
	rows, e := tx.Query(`SELECT ` + walletColumns + ` FROM wallets ORDER BY name,id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Wallet{}
	for rows.Next() {
		w, e := scanWallet(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// categoryExists reports whether cid names a stored category of the type.
func categoryExists(q querier, cid, kind string) (bool, error) {
	var count int
	if e := q.QueryRow(`SELECT count(*) FROM categories WHERE id=? AND type=?`, cid, kind).Scan(&count); e != nil {
		return false, e
	}
	return count == 1, nil
}

var dhaka = func() *time.Location {
	loc, e := time.LoadLocation("Asia/Dhaka")
	if e != nil {
		panic(e)
	}
	return loc
}()

func (s *Store) today() string           { return ledger.Today(s.now(), dhaka) }
func (s *Store) addDays(days int) string { return ledger.AddDays(s.now(), dhaka, days) }
func (s *Store) instant() string         { return ledger.Instant(s.now()) }
