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
	"net/url"
	"os"
	"path/filepath"
	"simply-finance/internal/ledger"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Store owns two connection pools on one SQLite file (see ADR 0012). writer has one connection
// and begins every transaction with BEGIN IMMEDIATE, so writes queue in order instead of failing
// on a lock upgrade. reader is a small read-only pool with deferred transactions: in WAL mode each
// read transaction sees one committed snapshot and never waits for a writer. Code reaches the
// pools only through write and read, whose closures receive the open transaction and nothing else.
type Store struct {
	writer *sql.DB
	reader *sql.DB
	now    func() time.Time
}

// readConnections bounds concurrent read transactions. The household has a few users, so a few
// connections cover a page load's parallel requests.
const readConnections = 4

// dbtx is one open transaction bound to its request context, so every statement inside it stops
// when the request is cancelled. Its methods mirror *sql.Tx without the Context suffix.
type dbtx struct {
	ctx context.Context
	tx  *sql.Tx
}

func (t dbtx) Exec(query string, args ...any) (sql.Result, error) {
	return t.tx.ExecContext(t.ctx, query, args...)
}
func (t dbtx) Query(query string, args ...any) (*sql.Rows, error) {
	return t.tx.QueryContext(t.ctx, query, args...)
}
func (t dbtx) QueryRow(query string, args ...any) *sql.Row {
	return t.tx.QueryRowContext(t.ctx, query, args...)
}

// read runs fn in one read-only snapshot on the reader pool.
func read[T any](ctx context.Context, s *Store, fn func(dbtx) (T, error)) (T, error) {
	var zero T
	tx, e := s.reader.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if e != nil {
		return zero, e
	}
	defer tx.Rollback()
	out, e := fn(dbtx{ctx, tx})
	if e != nil {
		return zero, e
	}
	return out, tx.Commit()
}

// change runs fn in one write transaction without an idempotency key, for session bookkeeping and
// for reads that store due bills. Financial writes use write instead.
func change[T any](ctx context.Context, s *Store, fn func(dbtx) (T, error)) (T, error) {
	var zero T
	tx, e := s.writer.BeginTx(ctx, nil)
	if e != nil {
		return zero, e
	}
	defer tx.Rollback()
	out, e := fn(dbtx{ctx, tx})
	if e != nil {
		return zero, e
	}
	return out, tx.Commit()
}

func Open(path string, now func() time.Time) (*Store, error) {
	return openDatabase(path, now, false)
}

// openDatabase opens the writer first, which creates the file when create is set and switches it to
// WAL, and then the read-only pool. synchronous stays at SQLite's default FULL: a committed money
// write survives power loss.
func openDatabase(path string, now func() time.Time, create bool) (*Store, error) {
	abs, e := filepath.Abs(path)
	if e != nil {
		return nil, e
	}
	pool := func(mode, lock string, pragmas ...string) (*sql.DB, error) {
		u := url.URL{Scheme: "file", Path: abs}
		q := u.Query()
		if mode != "" {
			q.Set("mode", mode)
		}
		for _, p := range append([]string{"foreign_keys(1)", "busy_timeout(5000)"}, pragmas...) {
			q.Add("_pragma", p)
		}
		q.Set("_txlock", lock)
		u.RawQuery = q.Encode()
		db, e := sql.Open("sqlite", u.String())
		if e != nil {
			return nil, e
		}
		if e = db.Ping(); e != nil {
			db.Close()
			return nil, e
		}
		return db, nil
	}
	mode := "rw"
	if create {
		mode = ""
	}
	writer, e := pool(mode, "immediate", "journal_mode(WAL)")
	if e != nil {
		return nil, e
	}
	writer.SetMaxOpenConns(1)
	reader, e := pool("rw", "deferred", "query_only(1)")
	if e != nil {
		writer.Close()
		return nil, e
	}
	reader.SetMaxOpenConns(readConnections)
	s := &Store{writer: writer, reader: reader, now: now}
	if now == nil {
		s.now = time.Now
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
func (s *Store) Close() error { return errors.Join(s.reader.Close(), s.writer.Close()) }

func (s *Store) Health(ctx context.Context) error {
	var version int
	return s.reader.QueryRowContext(ctx, `SELECT version FROM settings WHERE id=1`).Scan(&version)
}

// migrate applies the embedded migrations that are not recorded yet, all in one transaction. When
// any was applied it checks the derived state before committing, so a backfill that disagrees with
// the Go reading of the stored payloads leaves the database unchanged.
func (s *Store) migrate() error {
	_, e := change(context.Background(), s, func(tx dbtx) (struct{}, error) {
		var none struct{}
		if _, e := tx.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY)`); e != nil {
			return none, e
		}
		files, e := migrations.ReadDir("migrations")
		if e != nil {
			return none, e
		}
		applied := false
		for _, f := range files {
			var count int
			if e = tx.QueryRow(`SELECT count(*) FROM schema_migrations WHERE name=?`, f.Name()).Scan(&count); e != nil {
				return none, e
			}
			if count > 0 {
				continue
			}
			b, e := migrations.ReadFile("migrations/" + f.Name())
			if e != nil {
				return none, e
			}
			if _, e = tx.Exec(string(b)); e != nil {
				return none, fmt.Errorf("migration %s: %w", f.Name(), e)
			}
			if _, e = tx.Exec(`INSERT INTO schema_migrations VALUES(?)`, f.Name()); e != nil {
				return none, e
			}
			applied = true
		}
		if applied {
			if e = verifyDerived(tx); e != nil {
				return none, fmt.Errorf("migration check: %w", e)
			}
		}
		return none, nil
	})
	return e
}
func id() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func (s *Store) EnsureUser(ctx context.Context, email, name string) (User, error) {
	email, name, e := ledger.Profile(email, name)
	if e != nil {
		return User{}, e
	}
	return change(ctx, s, func(tx dbtx) (User, error) {
		var u User
		if _, e := tx.Exec(`INSERT INTO users VALUES(?,?,?) ON CONFLICT(email) DO NOTHING`, id(), email, name); e != nil {
			return u, e
		}
		e := tx.QueryRow(`SELECT id,email,name FROM users WHERE email=?`, email).Scan(&u.ID, &u.Email, &u.Name)
		return u, e
	})
}

// RequestKeyTTL is how long an Idempotency-Key and its stored response are kept. A retry inside
// this window replays the first response; expired keys are pruned on later writes, after which
// the same key is treated as a new request.
const RequestKeyTTL = 30 * 24 * time.Hour

func write[T any](ctx context.Context, s *Store, actor, key, operation string, input any, fn func(dbtx) (T, error)) (T, error) {
	var zero T
	if len(key) < 1 || len(key) > 128 {
		return zero, ledger.Invalid("", "Send an Idempotency-Key header of 1 to 128 characters.")
	}
	raw, e := json.Marshal(input)
	if e != nil {
		return zero, e
	}
	hash := sha256.Sum256(append([]byte(operation+":"), raw...))
	fingerprint := hex.EncodeToString(hash[:])
	sqlTx, e := s.writer.BeginTx(ctx, nil)
	if e != nil {
		return zero, e
	}
	defer sqlTx.Rollback()
	tx := dbtx{ctx, sqlTx}
	now := s.now().Unix()
	if _, e = tx.Exec(`DELETE FROM request_keys WHERE created_at<?`, now-int64(RequestKeyTTL/time.Second)); e != nil {
		return zero, e
	}
	var prior, body string
	e = tx.QueryRow(`SELECT fingerprint,response FROM request_keys WHERE actor_id=? AND key=?`, actor, key).Scan(&prior, &body)
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
	if e = tx.QueryRow(`SELECT count(*) FROM users WHERE id=?`, actor).Scan(&exists); e != nil {
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
	if _, e = tx.Exec(`INSERT INTO request_keys(actor_id,key,fingerprint,response,created_at) VALUES(?,?,?,?,?)`, actor, key, fingerprint, string(data), now); e != nil {
		return zero, e
	}
	if e = sqlTx.Commit(); e != nil {
		return zero, e
	}
	return out, nil
}
func (s *Store) audit(tx dbtx, actor, entity, action string, before, after any) error {
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
