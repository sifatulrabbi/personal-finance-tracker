package finance

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	_ "modernc.org/sqlite"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct {
	db  *sql.DB
	now func() time.Time
}
type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}
type WalletInput struct {
	Name           string `json:"name"`
	Type           string `json:"type"`
	CardType       string `json:"card_type"`
	Currency       string `json:"currency"`
	Details        string `json:"details"`
	OpeningBalance string `json:"opening_balance"`
	CreditLimit    string `json:"credit_limit"`
	// BankWalletID links a debit card to the bank wallet it draws from; required for new debit
	// cards and not allowed on other wallets. See docs/adr/0011-debit-cards-view-a-bank-wallet.md.
	BankWalletID string `json:"bank_wallet_id,omitempty"`
}
type Wallet struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type"`
	CardType        string `json:"card_type"`
	Currency        string `json:"currency"`
	Details         string `json:"details"`
	CreditLimit     string `json:"credit_limit"`
	BankWalletID    string `json:"bank_wallet_id,omitempty"`
	Balance         string `json:"balance"`
	Debt            string `json:"debt,omitempty"`
	AvailableCredit string `json:"available_credit,omitempty"`
	Archived        bool   `json:"archived"`
	// Version guards metadata edits (name, details, credit limit, archive). BalanceVersion changes
	// with every balance effect and guards adjustments.
	Version        int `json:"version"`
	BalanceVersion int `json:"balance_version"`
}

func Open(path string, now func() time.Time) (*Store, error) {
	return openDatabase(path, now, false)
}

func openDatabase(path string, now func() time.Time, create bool) (*Store, error) {
	abs, e := filepath.Abs(path)
	if e != nil {
		return nil, e
	}
	u := url.URL{Scheme: "file", Path: abs}
	q := u.Query()
	if !create {
		q.Set("mode", "rw")
	}
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Set("_txlock", "immediate")
	u.RawQuery = q.Encode()
	db, e := sql.Open("sqlite", u.String())
	if e != nil {
		return nil, e
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db, now: now}
	if now == nil {
		s.now = time.Now
	}
	if e = db.Ping(); e != nil {
		db.Close()
		return nil, e
	}
	return s, nil
}

func Migrate(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	s, err := openDatabase(path, time.Now, true)
	if err != nil {
		return err
	}
	defer s.Close()
	return s.migrate()
}
func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Health(ctx context.Context) error {
	var version int
	return s.db.QueryRowContext(ctx, `SELECT version FROM settings WHERE id=1`).Scan(&version)
}
func (s *Store) migrate() error {
	tx, e := s.db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY)`); e != nil {
		return e
	}
	files, e := migrations.ReadDir("migrations")
	if e != nil {
		return e
	}
	for _, f := range files {
		var count int
		if e = tx.QueryRow(`SELECT count(*) FROM schema_migrations WHERE name=?`, f.Name()).Scan(&count); e != nil {
			return e
		}
		if count > 0 {
			continue
		}
		b, e := migrations.ReadFile("migrations/" + f.Name())
		if e != nil {
			return e
		}
		if _, e = tx.Exec(string(b)); e != nil {
			return fmt.Errorf("migration %s: %w", f.Name(), e)
		}
		if _, e = tx.Exec(`INSERT INTO schema_migrations VALUES(?)`, f.Name()); e != nil {
			return e
		}
	}
	return tx.Commit()
}
func id() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func NormalizeEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	a, e := mail.ParseAddress(email)
	if e != nil || a.Address != email || len(email) > 254 {
		return "", ErrInvalid
	}
	return email, nil
}
func (s *Store) EnsureUser(ctx context.Context, email, name string) (User, error) {
	email, e := NormalizeEmail(email)
	if e != nil {
		return User{}, e
	}
	if name == "" {
		name = email
	}
	if len(name) > 120 {
		return User{}, ErrInvalid
	}
	_, e = s.db.ExecContext(ctx, `INSERT INTO users VALUES(?,?,?) ON CONFLICT(email) DO NOTHING`, id(), email, name)
	if e != nil {
		return User{}, e
	}
	var u User
	e = s.db.QueryRowContext(ctx, `SELECT id,email,name FROM users WHERE email=?`, email).Scan(&u.ID, &u.Email, &u.Name)
	return u, e
}

// RequestKeyTTL is how long an Idempotency-Key and its stored response are kept. A retry inside
// this window replays the first response; expired keys are pruned on later writes, after which
// the same key is treated as a new request.
const RequestKeyTTL = 30 * 24 * time.Hour

func write[T any](ctx context.Context, s *Store, actor, key, operation string, input any, fn func(*sql.Tx) (T, error)) (T, error) {
	var zero T
	if len(key) < 1 || len(key) > 128 {
		return zero, invalid("", "Send an Idempotency-Key header of 1 to 128 characters.")
	}
	raw, e := json.Marshal(input)
	if e != nil {
		return zero, e
	}
	hash := sha256.Sum256(append([]byte(operation+":"), raw...))
	fingerprint := hex.EncodeToString(hash[:])
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return zero, e
	}
	defer tx.Rollback()
	now := s.now().Unix()
	if _, e = tx.ExecContext(ctx, `DELETE FROM request_keys WHERE created_at<?`, now-int64(RequestKeyTTL/time.Second)); e != nil {
		return zero, e
	}
	var prior, body string
	e = tx.QueryRowContext(ctx, `SELECT fingerprint,response FROM request_keys WHERE actor_id=? AND key=?`, actor, key).Scan(&prior, &body)
	if e == nil {
		if prior != fingerprint {
			return zero, ErrIdempotencyKeyReused
		}
		var out T
		e = json.Unmarshal([]byte(body), &out)
		return out, e
	}
	if !errors.Is(e, sql.ErrNoRows) {
		return zero, e
	}
	var exists int
	if e = tx.QueryRowContext(ctx, `SELECT count(*) FROM users WHERE id=?`, actor).Scan(&exists); e != nil {
		return zero, e
	}
	if exists == 0 {
		return zero, ErrInvalid
	}
	out, e := fn(tx)
	if e != nil {
		return zero, e
	}
	data, e := json.Marshal(out)
	if e != nil {
		return zero, e
	}
	if _, e = tx.ExecContext(ctx, `INSERT INTO request_keys(actor_id,key,fingerprint,response,created_at) VALUES(?,?,?,?,?)`, actor, key, fingerprint, string(data), now); e != nil {
		return zero, e
	}
	if e = tx.Commit(); e != nil {
		return zero, e
	}
	return out, nil
}
func (s *Store) audit(tx *sql.Tx, actor, entity, action string, before, after any) error {
	a, e := json.Marshal(before)
	if e != nil {
		return e
	}
	b, e := json.Marshal(after)
	if e != nil {
		return e
	}
	_, e = tx.Exec(`INSERT INTO audit_events(actor_id,entity_id,action,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)`, actor, entity, action, string(a), string(b), s.instant())
	return e
}
func (s *Store) CreateWallet(ctx context.Context, actor, key string, in WalletInput) (Wallet, error) {
	return write(ctx, s, actor, key, "wallet.create", in, func(tx *sql.Tx) (Wallet, error) {
		var zero Wallet
		if e := validWalletText(in.Name, in.Details); e != nil {
			return zero, e
		}
		if in.BankWalletID != "" && in.CardType != "debit" {
			return zero, invalid("bank_wallet_id", "Only debit cards link to a bank wallet.")
		}
		if in.CardType == "debit" {
			if in.BankWalletID == "" {
				return zero, invalid("bank_wallet_id", "Choose the bank wallet this debit card draws from.")
			}
			bank, e := wallet(tx, in.BankWalletID)
			if e != nil {
				return zero, walletNotFound("bank_wallet_id", e)
			}
			if bank.Type != "bank" {
				return zero, invalid("bank_wallet_id", "A debit card must link to a bank wallet.")
			}
			if bank.Archived {
				return zero, archived("bank_wallet_id", "This bank wallet is archived. Choose an active one.")
			}
			if in.Currency == "" {
				in.Currency = bank.Currency
			} else if in.Currency != bank.Currency {
				return zero, invalid("currency", "A debit card uses its bank wallet's currency.")
			}
		}
		if in.Currency == "" {
			in.Currency = "BDT"
		}
		if in.Currency != "BDT" && in.Currency != "USD" {
			return zero, invalid("currency", "Choose BDT or USD.")
		}
		if in.Type != "physical" && in.Type != "bank" && in.Type != "digital" && in.Type != "card" {
			return zero, invalid("type", "Choose physical, bank, digital, or card.")
		}
		if in.Type == "card" {
			if in.CardType != "credit" && in.CardType != "debit" {
				return zero, invalid("card_type", "Choose credit or debit for a card.")
			}
		} else if in.CardType != "" {
			return zero, invalid("card_type", "Only card wallets have a card type.")
		}
		opening, limit := int64(0), int64(0)
		var e error
		if in.OpeningBalance != "" {
			opening, e = ParseMoney(in.OpeningBalance)
			if e != nil {
				return zero, invalid("opening_balance", "Enter an opening balance with at most two decimal places.")
			}
		}
		if in.CreditLimit != "" {
			limit, e = ParseMoney(in.CreditLimit)
			if e != nil || limit < 0 {
				return zero, invalid("credit_limit", "Enter a credit limit of zero or more, with at most two decimal places.")
			}
		}
		if in.CardType != "credit" && limit != 0 {
			return zero, invalid("credit_limit", "Only credit cards have a credit limit.")
		}
		if in.CardType == "debit" && opening != 0 {
			return zero, invalid("opening_balance", "A debit card has no balance of its own. Record the balance on its bank wallet.")
		}
		wid := id()
		var bank any
		if in.BankWalletID != "" {
			bank = in.BankWalletID
		}
		_, e = tx.Exec(`INSERT INTO wallets(id,name,type,card_type,currency,details,credit_limit,bank_wallet_id) VALUES(?,?,?,?,?,?,?,?)`, wid, in.Name, in.Type, in.CardType, in.Currency, in.Details, limit, bank)
		if e != nil {
			return zero, e
		}
		if in.CardType == "debit" {
			w, e := wallet(tx, wid)
			if e != nil {
				return zero, e
			}
			return w, s.audit(tx, actor, wid, "create", nil, w)
		}
		signed := opening
		if in.CardType == "credit" {
			signed = -opening
		}
		tid := id()
		if _, e = tx.Exec(`INSERT INTO transactions(id,version) VALUES(?,1)`, tid); e != nil {
			return zero, e
		}
		payload, _ := json.Marshal(map[string]any{"kind": "opening", "wallet_id": wid, "amount": FormatMoney(opening), "date": s.today()})
		if _, e = tx.Exec(`INSERT INTO transaction_revisions VALUES(?,1,?,?,?)`, tid, string(payload), actor, s.instant()); e != nil {
			return zero, e
		}
		if _, e = tx.Exec(`INSERT INTO wallet_entries(transaction_id,version,wallet_id,delta) VALUES(?,1,?,?)`, tid, wid, signed); e != nil {
			return zero, e
		}
		w, e := wallet(tx, wid)
		if e != nil {
			return zero, e
		}
		return w, s.audit(tx, actor, wid, "create", nil, w)
	})
}

func validWalletText(name, details string) error {
	if strings.TrimSpace(name) == "" || len(name) > 120 {
		return invalid("name", "Enter a name of at most 120 bytes.")
	}
	if len(details) > 2000 {
		return invalid("details", "Keep the details to at most 2,000 bytes.")
	}
	return nil
}

type querier interface {
	QueryRow(query string, args ...any) *sql.Row
}

func wallet(q querier, wid string) (Wallet, error) {
	var w Wallet
	var limit, balance int64
	e := q.QueryRow(`SELECT w.id,w.name,w.type,w.card_type,w.currency,w.details,w.credit_limit,w.archived,w.version,w.balance_version,COALESCE(w.bank_wallet_id,''),COALESCE((SELECT SUM(delta) FROM wallet_entries WHERE wallet_id=w.id),0) FROM wallets w WHERE w.id=?`, wid).Scan(&w.ID, &w.Name, &w.Type, &w.CardType, &w.Currency, &w.Details, &limit, &w.Archived, &w.Version, &w.BalanceVersion, &w.BankWalletID, &balance)
	if errors.Is(e, sql.ErrNoRows) {
		return w, ErrNotFound
	}
	if e != nil {
		return w, e
	}
	w.CreditLimit = FormatMoney(limit)
	w.Balance = FormatMoney(balance)
	if w.CardType == "credit" {
		w.Debt = FormatMoney(-balance)
		w.AvailableCredit = FormatMoney(limit + balance)
		w.Balance = "0.00"
	}
	return w, nil
}

// ledgerID is the wallet whose entries carry this wallet's balance effects: a linked debit card
// posts to its bank wallet; every other wallet, including a legacy unlinked debit card, to itself.
func (w Wallet) ledgerID() string {
	if w.BankWalletID != "" {
		return w.BankWalletID
	}
	return w.ID
}

// legacyDebit reports a debit card created before bank links existed. It keeps its own recorded
// balance but takes no new balance; see ADR 0011.
func (w Wallet) legacyDebit() bool { return w.CardType == "debit" && w.BankWalletID == "" }

const errLegacyDebit = "This debit card is not linked to a bank wallet, so it takes no new activity. Record it on the bank wallet, or add the card again linked to its bank wallet."

func (s *Store) Wallet(ctx context.Context, wid string) (Wallet, error) { return wallet(s.db, wid) }
func (s *Store) Wallets(ctx context.Context) ([]Wallet, error) {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	rows, e := tx.QueryContext(ctx, `SELECT id FROM wallets ORDER BY name,id`)
	if e != nil {
		return nil, e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return nil, e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return nil, e
	}
	out := []Wallet{}
	for _, id := range ids {
		w, e := wallet(tx, id)
		if e != nil {
			return nil, e
		}
		out = append(out, w)
	}
	return out, nil
}

var dhaka = func() *time.Location {
	loc, e := time.LoadLocation("Asia/Dhaka")
	if e != nil {
		panic(e)
	}
	return loc
}()

func (s *Store) today() string { return s.now().In(dhaka).Format("2006-01-02") }

// instantLayout is a fixed-width UTC layout, so stored instants sort correctly as strings.
// RFC3339Nano trims trailing zeros and made "…00.12Z" sort after "…00.123Z".
const instantLayout = "2006-01-02T15:04:05.000000000Z"

func (s *Store) instant() string { return s.now().UTC().Format(instantLayout) }
