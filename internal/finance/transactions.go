package finance

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sort"
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

// effect is one balance change. walletID is the ledger wallet (a linked debit card's bank);
// field names the input that selected it, for error reporting.
type effect struct {
	walletID string
	delta    int64
	field    string
}

func validPage(limit, offset int) error {
	if limit < 1 || limit > 200 {
		return invalid("limit", "Use a limit from 1 to 200.")
	}
	if offset < 0 {
		return invalid("offset", "Use an offset of zero or more.")
	}
	return nil
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
	if e = checkNamedWallets(tx, in, nil); e != nil {
		return Transaction{}, e
	}
	if e = keepArchivedBalances(tx, in, nil, effects, "This wallet is archived. Choose an active wallet."); e != nil {
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
	if in.Kind != "income" && in.Kind != "expense" && in.Kind != "transfer" {
		return r, nil, invalid("kind", "Choose income, expense, or transfer.")
	}
	cid, err := categoryID(tx, in.Kind, in.CategoryID)
	if err != nil {
		return r, nil, err
	}
	r.CategoryID = cid
	if !validDate(in.Date) {
		return r, nil, invalid("date", "Enter a date as YYYY-MM-DD.")
	}
	if len(in.Note) > 2000 {
		return r, nil, invalid("note", "Keep the note to at most 2,000 bytes.")
	}
	if len(in.Reason) > 500 {
		return r, nil, invalid("reason", "Keep the reason to at most 500 bytes.")
	}
	w, e := wallet(tx, in.WalletID)
	if e != nil {
		return r, nil, walletNotFound("wallet_id", e)
	}
	amount, e := ParseMoney(in.Amount)
	if e != nil || amount <= 0 {
		return r, nil, invalid("amount", "Enter a positive amount with at most two decimal places.")
	}
	r.Amount = FormatMoney(amount)
	var to Wallet
	if in.Kind == "transfer" {
		if in.ToWalletID == w.ID {
			return r, nil, invalid("to_wallet_id", "Choose a different wallet to transfer to.")
		}
		if to, e = wallet(tx, in.ToWalletID); e != nil {
			return r, nil, walletNotFound("to_wallet_id", e)
		}
		if to.ledgerID() == w.ledgerID() {
			return r, nil, invalid("to_wallet_id", "A debit card and its bank wallet hold the same money. Choose a different wallet to transfer to.")
		}
	} else if in.ToWalletID != "" {
		return r, nil, invalid("to_wallet_id", "Only transfers have a destination wallet.")
	} else if in.ReceivedAmount != "" {
		return r, nil, invalid("received_amount", "Only transfers have a received amount.")
	}
	// A rate is required only when a value must be converted: a USD income or expense needs its BDT
	// value, and a cross-currency transfer without a received amount derives it from the rate. Any
	// other USD record snapshots the default rate when one is set, as a reference.
	rate := int64(0)
	usesUSD := w.Currency == "USD" || to.Currency == "USD"
	needsRate := (in.Kind != "transfer" && w.Currency == "USD") || (in.Kind == "transfer" && to.Currency != w.Currency && in.ReceivedAmount == "")
	if in.Rate != "" {
		rate, e = ParseRate(in.Rate)
		if e != nil {
			return r, nil, invalid("rate", "Enter a positive rate with at most six decimal places.")
		}
	} else if usesUSD {
		set, e := settings(tx)
		if e != nil {
			return r, nil, e
		}
		if set.Rate != "" {
			if rate, e = ParseRate(set.Rate); e != nil {
				return r, nil, e
			}
		} else if needsRate {
			return r, nil, ErrRateRequired
		}
	}
	if rate > 0 {
		r.Rate = FormatRate(rate)
	}
	bdt := amount
	if w.Currency == "USD" && rate > 0 {
		bdt, e = Convert(amount, rate, "USD")
		if e != nil {
			return r, nil, invalid("amount", "This amount is larger than the supported limit at this rate.")
		}
	}
	r.BDTAmount = FormatMoney(bdt)
	if in.Kind == "transfer" {
		received := amount
		if in.ReceivedAmount != "" {
			received, e = ParseMoney(in.ReceivedAmount)
			if e != nil || received <= 0 {
				return r, nil, invalid("received_amount", "Enter a positive received amount with at most two decimal places.")
			}
		} else if to.Currency != w.Currency {
			received, e = Convert(amount, rate, w.Currency)
			if e != nil || received <= 0 {
				return r, nil, invalid("received_amount", "Enter the received amount; it cannot be derived from this amount and rate.")
			}
		}
		if to.Currency == w.Currency && received != amount {
			return r, nil, invalid("received_amount", "A transfer between wallets of the same currency must receive the amount sent.")
		}
		r.ReceivedAmount = FormatMoney(received)
		// Without a rate, a USD transfer's BDT value is known only when BDT is received.
		if w.Currency == "USD" && rate == 0 {
			r.BDTAmount = ""
			if to.Currency == "BDT" {
				r.BDTAmount = r.ReceivedAmount
			}
		}
		return r, []effect{{w.ledgerID(), -amount, "wallet_id"}, {to.ledgerID(), received, "to_wallet_id"}}, nil
	}
	delta := amount
	if in.Kind == "expense" {
		delta = -amount
	}
	return r, []effect{{w.ledgerID(), delta, "wallet_id"}}, nil
}

// checkNamedWallets applies the rules about which wallets a record may newly name, for a new
// record (old nil) or a correction. A wallet already named in the same slot stays allowed, so
// repairs of existing records keep working. An archived wallet cannot be newly named. A legacy
// unlinked debit card cannot newly take income, expenses, or incoming transfers; transfers out of
// it stay allowed so its balance can be drained.
func checkNamedWallets(tx *sql.Tx, in TransactionInput, old *Transaction) error {
	slots := []struct{ field, id, before string }{{"wallet_id", in.WalletID, ""}, {"to_wallet_id", in.ToWalletID, ""}}
	if old != nil {
		slots[0].before, slots[1].before = old.WalletID, old.ToWalletID
	}
	for _, slot := range slots {
		if slot.id == "" || (old != nil && slot.id == slot.before) {
			continue
		}
		w, e := wallet(tx, slot.id)
		if e != nil {
			return walletNotFound(slot.field, e)
		}
		if w.Archived {
			return archived(slot.field, "This wallet is archived. Choose an active wallet.")
		}
		if w.legacyDebit() && (slot.field == "to_wallet_id" || in.Kind != "transfer") {
			return invalid(slot.field, errLegacyDebit)
		}
	}
	return nil
}

// keepArchivedBalances rejects a change that would move the balance of an archived wallet the
// record names. A new record may not use an archived wallet at all; a correction may keep one when
// its balance stays the same (note, date, category, or a USD rate that only changes the BDT value).
// Moving a record off an archived wallet is allowed: like void, it is an explicit repair that takes
// the record away from the closed account, and the corrected record no longer names that wallet.
func keepArchivedBalances(tx *sql.Tx, in TransactionInput, before, after []effect, message string) error {
	net := map[string]int64{}
	fields := map[string]string{}
	for _, ef := range after {
		net[ef.walletID] += ef.delta
		if fields[ef.walletID] == "" {
			fields[ef.walletID] = ef.field
		}
	}
	for _, ef := range before {
		if _, named := net[ef.walletID]; named {
			net[ef.walletID] -= ef.delta
		}
	}
	changed := []string{}
	for wid, delta := range net {
		if delta != 0 {
			changed = append(changed, wid)
		}
	}
	sort.Strings(changed)
	for _, wid := range changed {
		w, e := wallet(tx, wid)
		if e != nil {
			return e
		}
		if w.Archived {
			field := fields[wid]
			if field == "" {
				field = "wallet_id"
			}
			return archived(field, message)
		}
	}
	return nil
}
func (s *Store) saveRevision(tx *sql.Tx, actor string, r Transaction, effects []effect) (Transaction, error) {
	r.CreatedAt = s.instant()
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
			return r, errBalanceLimit
		}
		if _, e = tx.Exec(`UPDATE wallets SET balance_version=balance_version+1 WHERE id=?`, ef.walletID); e != nil {
			return r, e
		}
	}
	return r, nil
}

var errBalanceLimit = invalid("amount", "This would take a wallet balance beyond the supported limit.")

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
		// Reconciliation records are final at every version, so this comes before the stale check.
		if old.Kind == "opening" || old.Kind == "adjustment" {
			return old, ErrNotCorrectable
		}
		if old.Version != version {
			return old, ErrStaleVersion
		}
		if old.Voided {
			return old, errVoided
		}
		if void && strings.TrimSpace(in.Reason) == "" {
			return old, invalid("reason", "Enter a reason for voiding this record.")
		}
		if len(in.Reason) > 500 {
			return old, invalid("reason", "Keep the reason to at most 500 bytes.")
		}
		previous, e := currentEntries(tx, tid, version)
		if e != nil {
			return old, e
		}
		r := old
		var effects []effect
		if !void {
			// Omitted correction fields keep the prior value where empty is not itself a valid choice.
			if in.Rate == "" {
				in.Rate = old.Rate
			}
			if in.CategoryID == "" {
				in.CategoryID = old.CategoryID
			}
			if in.Kind != old.Kind {
				return old, invalid("kind", "A record's kind cannot change. Void it and record a new one.")
			}
			r, effects, e = s.prepare(tx, in)
			if e != nil {
				return r, e
			}
			if e = checkNamedWallets(tx, in, &old); e != nil {
				return old, e
			}
			before := make([]effect, len(previous))
			for i, entry := range previous {
				before[i] = entry.effect
			}
			if e = keepArchivedBalances(tx, in, before, effects, "This correction would change an archived wallet's balance. Void the record or unarchive the wallet first."); e != nil {
				return old, e
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
		for _, entry := range previous {
			if _, e = tx.Exec(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta,reversal_of) VALUES(?,?,?,?,?)`, tid, r.Version, entry.walletID, -entry.delta, entry.id); e != nil {
				return r, e
			}
			if _, e = tx.Exec(`UPDATE wallets SET balance_version=balance_version+1 WHERE id=?`, entry.walletID); e != nil {
				return r, e
			}
		}
		for _, ef := range effects {
			if _, e = tx.Exec(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta) VALUES(?,?,?,?)`, tid, r.Version, ef.walletID, ef.delta); e != nil {
				return r, e
			}
			if _, e = tx.Exec(`UPDATE wallets SET balance_version=balance_version+1 WHERE id=?`, ef.walletID); e != nil {
				return r, e
			}
		}
		touched := map[string]bool{}
		for _, entry := range previous {
			touched[entry.walletID] = true
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
				return r, errBalanceLimit
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

type entry struct {
	id int64
	effect
}

// currentEntries returns the wallet entries a revision applied, which a correction or void reverses.
func currentEntries(tx *sql.Tx, tid string, version int) ([]entry, error) {
	rows, e := tx.Query(`SELECT id,wallet_id,delta FROM wallet_entries WHERE transaction_id=? AND version=? AND reversal_of IS NULL`, tid, version)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []entry{}
	for rows.Next() {
		var en entry
		if e = rows.Scan(&en.id, &en.walletID, &en.delta); e != nil {
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
	defaultCategory(&r)
	// The row, not the payload, is authoritative: opening payloads were stored without a version.
	r.ID, r.Version, r.Voided = tid, version, voided
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
	if e := validPage(limit, offset); e != nil {
		return nil, e
	}
	rows, e := s.db.QueryContext(ctx, `SELECT r.payload,t.id,r.version,u.email,r.created_at FROM transactions t JOIN transaction_revisions r ON r.transaction_id=t.id AND r.version=t.version JOIN users u ON u.id=r.actor_id ORDER BY json_extract(r.payload,'$.date') DESC,r.created_at DESC,r.rowid DESC LIMIT ? OFFSET ?`, limit, offset)
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
