// Package sqlite is the storage adapter: it opens the SQLite file, applies the embedded migrations
// and seeds, runs every use case in one transaction, and maps records to rows, including the typed
// current-state columns and the request-key table. It implements app.Store for the use cases and
// the user and session storage that internal/auth needs. It holds no clock: callers pass instants.
package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"

	"simply-finance/internal/app"
	"simply-finance/internal/ledger"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Store owns two connection pools on one SQLite file (see ADR 0012). writer has one connection
// and begins every transaction with BEGIN IMMEDIATE, so writes queue in order instead of failing
// on a lock upgrade. reader is a small read-only pool with deferred transactions: in WAL mode each
// read transaction sees one committed snapshot and never waits for a writer. Code reaches the
// pools only through Read, Change, and Write (and run, which they share), whose closures receive
// the open transaction and nothing else.
type Store struct {
	writer *sql.DB
	reader *sql.DB
}

var _ app.Store = (*Store)(nil)

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

// records is the app.Tx implementation: the record access of one open transaction.
type records struct{ dbtx }

var _ app.Tx = records{}

// run opens a transaction on pool, runs fn in it, and commits only when fn succeeds.
func run(ctx context.Context, pool *sql.DB, opts *sql.TxOptions, fn func(records) error) error {
	tx, e := pool.BeginTx(ctx, opts)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if e = fn(records{dbtx{ctx, tx}}); e != nil {
		return e
	}
	return tx.Commit()
}

// Read runs fn in one read-only snapshot on the reader pool.
func (s *Store) Read(ctx context.Context, fn func(app.Tx) error) error {
	return run(ctx, s.reader, &sql.TxOptions{ReadOnly: true}, func(r records) error { return fn(r) })
}

// Change runs fn in one write transaction without a request key.
func (s *Store) Change(ctx context.Context, fn func(app.Tx) error) error {
	return run(ctx, s.writer, nil, func(r records) error { return fn(r) })
}

// Write runs fn under a request key; see app.Store.
func (s *Store) Write(ctx context.Context, key app.RequestKey, fn func(app.Tx) (any, error)) (any, []byte, error) {
	var result any
	var replay []byte
	e := run(ctx, s.writer, nil, func(r records) error {
		var e error
		if replay, e = r.requestKey(key); e != nil {
			return e
		}
		if replay != nil {
			return errReplayed // A replay changes nothing, not even the pruning.
		}
		if e = r.userExists(key.ActorID); e != nil {
			return e
		}
		if result, e = fn(r); e != nil {
			return e
		}
		return r.saveRequestKey(key, result)
	})
	if errors.Is(e, errReplayed) {
		return nil, replay, nil
	}
	if e != nil {
		return nil, nil, e
	}
	return result, nil, nil
}

// errReplayed rolls back a Write whose key already holds a response.
var errReplayed = errors.New("request key replayed")

// Open opens an existing database without migrating, seeding, or checking schema versions.
func Open(path string) (*Store, error) {
	return openDatabase(path, false)
}

// openDatabase opens the writer first, which creates the file when create is set and switches it to
// WAL, and then the read-only pool. synchronous stays at SQLite's default FULL: a committed money
// write survives power loss.
func openDatabase(path string, create bool) (*Store, error) {
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
	return &Store{writer: writer, reader: reader}, nil
}

// Migrate creates the database when needed and applies the pending embedded migrations.
func Migrate(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	s, err := openDatabase(path, true)
	if err != nil {
		return err
	}
	defer s.Close()
	return s.migrate()
}

func (s *Store) Close() error { return errors.Join(s.reader.Close(), s.writer.Close()) }

// Health is the readiness check: one read of the settings row.
func (s *Store) Health(ctx context.Context) error {
	var version int
	return s.reader.QueryRowContext(ctx, `SELECT version FROM settings WHERE id=1`).Scan(&version)
}

// migrate applies the embedded migrations that are not recorded yet, all in one transaction. When
// any was applied it checks the derived state before committing, so a backfill that disagrees with
// the Go reading of the stored payloads leaves the database unchanged.
func (s *Store) migrate() error {
	return run(context.Background(), s.writer, nil, func(tx records) error {
		if _, e := tx.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY)`); e != nil {
			return e
		}
		files, e := migrations.ReadDir("migrations")
		if e != nil {
			return e
		}
		applied := false
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
			applied = true
		}
		if applied {
			if e = tx.verifyDerived(); e != nil {
				return fmt.Errorf("migration check: %w", e)
			}
		}
		return nil
	})
}

func newID() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}

// EnsureUser returns the profile for an authenticated email, creating it on first login. A profile
// never grants access; the ENV credentials do (ADR 0003).
func (s *Store) EnsureUser(ctx context.Context, email, name string) (ledger.User, error) {
	email, name, e := ledger.Profile(email, name)
	if e != nil {
		return ledger.User{}, e
	}
	var u ledger.User
	e = run(ctx, s.writer, nil, func(tx records) error {
		if _, e := tx.Exec(`INSERT INTO users VALUES(?,?,?) ON CONFLICT(email) DO NOTHING`, newID(), email, name); e != nil {
			return e
		}
		return tx.QueryRow(`SELECT id,email,name FROM users WHERE email=?`, email).Scan(&u.ID, &u.Email, &u.Name)
	})
	if e != nil {
		return ledger.User{}, e
	}
	return u, nil
}
