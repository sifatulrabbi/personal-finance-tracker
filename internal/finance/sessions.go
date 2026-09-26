package finance

import (
	"context"
	"database/sql"
	"errors"
)

func (s *Store) SaveSession(ctx context.Context, tokenHash, userID, credentialHash string, expires int64) error {
	_, e := change(ctx, s, func(tx dbtx) (struct{}, error) {
		if _, e := tx.Exec(`DELETE FROM sessions WHERE expires_at<=?`, s.now().Unix()); e != nil {
			return struct{}{}, e
		}
		_, e := tx.Exec(`INSERT INTO sessions VALUES(?,?,?,?)`, tokenHash, userID, credentialHash, expires)
		return struct{}{}, e
	})
	return e
}
func (s *Store) Session(ctx context.Context, hash string) (User, string, error) {
	type found struct {
		user       User
		credential string
	}
	now := s.now().Unix()
	f, e := read(ctx, s, func(tx dbtx) (found, error) {
		var f found
		e := tx.QueryRow(`SELECT u.id,u.email,u.name,s.credential_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`, hash, now).Scan(&f.user.ID, &f.user.Email, &f.user.Name, &f.credential)
		return f, e
	})
	if errors.Is(e, sql.ErrNoRows) {
		return User{}, "", ErrUnauthorized
	}
	return f.user, f.credential, e
}
func (s *Store) DeleteSession(ctx context.Context, hash string) error {
	_, e := change(ctx, s, func(tx dbtx) (struct{}, error) {
		_, e := tx.Exec(`DELETE FROM sessions WHERE token_hash=?`, hash)
		return struct{}{}, e
	})
	return e
}
func (s *Store) ReconcileSessions(ctx context.Context, allowed map[string]string) error {
	_, e := change(ctx, s, func(tx dbtx) (struct{}, error) {
		var none struct{}
		rows, e := tx.Query(`SELECT s.token_hash,u.email,s.credential_hash FROM sessions s JOIN users u ON u.id=s.user_id`)
		if e != nil {
			return none, e
		}
		remove := []string{}
		for rows.Next() {
			var token, email, hash string
			if e = rows.Scan(&token, &email, &hash); e != nil {
				rows.Close()
				return none, e
			}
			if allowed[email] != hash {
				remove = append(remove, token)
			}
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return none, e
		}
		for _, token := range remove {
			if _, e = tx.Exec(`DELETE FROM sessions WHERE token_hash=?`, token); e != nil {
				return none, e
			}
		}
		return none, nil
	})
	return e
}
