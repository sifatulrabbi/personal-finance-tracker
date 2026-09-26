package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"simply-finance/internal/ledger"
)

// SaveSession stores a session by its token hash, first removing expired sessions.
func (s *Store) SaveSession(ctx context.Context, tokenHash, userID, credentialHash string, expires, now time.Time) error {
	return run(ctx, s.writer, nil, func(tx records) error {
		if _, e := tx.Exec(`DELETE FROM sessions WHERE expires_at<=?`, now.Unix()); e != nil {
			return e
		}
		_, e := tx.Exec(`INSERT INTO sessions VALUES(?,?,?,?)`, tokenHash, userID, credentialHash, expires.Unix())
		return e
	})
}

// Session reads the unexpired session with this token hash: its user and the digest of the
// credential it was created with. A missing or expired session is ledger.ErrUnauthorized.
func (s *Store) Session(ctx context.Context, tokenHash string, now time.Time) (ledger.User, string, error) {
	var u ledger.User
	var credential string
	e := run(ctx, s.reader, &sql.TxOptions{ReadOnly: true}, func(tx records) error {
		return tx.QueryRow(`SELECT u.id,u.email,u.name,s.credential_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`, tokenHash, now.Unix()).Scan(&u.ID, &u.Email, &u.Name, &credential)
	})
	if errors.Is(e, sql.ErrNoRows) {
		return ledger.User{}, "", ledger.ErrUnauthorized
	}
	if e != nil {
		return ledger.User{}, "", e
	}
	return u, credential, nil
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	return run(ctx, s.writer, nil, func(tx records) error {
		_, e := tx.Exec(`DELETE FROM sessions WHERE token_hash=?`, tokenHash)
		return e
	})
}

// ReconcileSessions deletes every session whose user's email is no longer allowed, or whose
// credential digest no longer matches allowed[email], so removing or changing an ENV credential
// signs its sessions out (ADR 0003).
func (s *Store) ReconcileSessions(ctx context.Context, allowed map[string]string) error {
	return run(ctx, s.writer, nil, func(tx records) error {
		rows, e := tx.Query(`SELECT s.token_hash,u.email,s.credential_hash FROM sessions s JOIN users u ON u.id=s.user_id`)
		if e != nil {
			return e
		}
		type session struct{ token, email, credential string }
		all, e := collect(rows, func(row scanner) (session, error) {
			var s session
			e := row.Scan(&s.token, &s.email, &s.credential)
			return s, e
		})
		if e != nil {
			return e
		}
		for _, s := range all {
			if allowed[s.email] == s.credential {
				continue
			}
			if _, e = tx.Exec(`DELETE FROM sessions WHERE token_hash=?`, s.token); e != nil {
				return e
			}
		}
		return nil
	})
}
