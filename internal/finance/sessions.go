package finance

import (
	"context"
	"database/sql"
	"errors"
)

var ErrUnauthorized = errors.New("authentication required")

func (s *Store) SaveSession(ctx context.Context, tokenHash, userID, credentialHash string, expires int64) error {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.Exec(`DELETE FROM sessions WHERE expires_at<=?`, s.now().Unix()); e != nil {
		return e
	}
	if _, e = tx.Exec(`INSERT INTO sessions VALUES(?,?,?,?)`, tokenHash, userID, credentialHash, expires); e != nil {
		return e
	}
	return tx.Commit()
}
func (s *Store) Session(ctx context.Context, hash string) (User, string, error) {
	var u User
	var credential string
	e := s.db.QueryRowContext(ctx, `SELECT u.id,u.email,u.name,s.credential_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`, hash, s.now().Unix()).Scan(&u.ID, &u.Email, &u.Name, &credential)
	if errors.Is(e, sql.ErrNoRows) {
		return u, "", ErrUnauthorized
	}
	return u, credential, e
}
func (s *Store) DeleteSession(ctx context.Context, hash string) error {
	_, e := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash=?`, hash)
	return e
}
func (s *Store) ReconcileSessions(ctx context.Context, allowed map[string]string) error {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	rows, e := tx.Query(`SELECT s.token_hash,u.email,s.credential_hash FROM sessions s JOIN users u ON u.id=s.user_id`)
	if e != nil {
		return e
	}
	remove := []string{}
	for rows.Next() {
		var token, email, hash string
		if e = rows.Scan(&token, &email, &hash); e != nil {
			rows.Close()
			return e
		}
		if allowed[email] != hash {
			remove = append(remove, token)
		}
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, token := range remove {
		if _, e = tx.Exec(`DELETE FROM sessions WHERE token_hash=?`, token); e != nil {
			return e
		}
	}
	return tx.Commit()
}
