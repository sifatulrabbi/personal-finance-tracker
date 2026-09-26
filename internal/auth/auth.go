// Package auth signs household members in and out. Allowed emails and password hashes come from
// configuration (ADR 0003), sessions live in the store, and failed logins are throttled per client
// address and per account (ADR 0009). It knows nothing about HTTP: the transport passes the
// client's address and the session token, and sets its own cookie.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"golang.org/x/crypto/bcrypt"

	"simply-finance/internal/ledger"
)

// Credential is one allowed household member, as configured in AUTH_USERS_JSON.
type Credential struct {
	Email        string `json:"email"`
	PasswordHash string `json:"password_hash"`
	Name         string `json:"name"`
}

// Store is the user and session storage auth needs. The SQLite adapter implements it.
type Store interface {
	// EnsureUser returns the profile for an authenticated email, creating it on first login.
	EnsureUser(ctx context.Context, email, name string) (ledger.User, error)
	SaveSession(ctx context.Context, tokenHash, userID, credentialHash string, expires, now time.Time) error
	// Session returns the unexpired session's user and credential digest, or ledger.ErrUnauthorized.
	Session(ctx context.Context, tokenHash string, now time.Time) (ledger.User, string, error)
	DeleteSession(ctx context.Context, tokenHash string) error
	// ReconcileSessions deletes sessions whose email is not in allowed or whose credential digest
	// differs from allowed[email].
	ReconcileSessions(ctx context.Context, allowed map[string]string) error
}

// Config is the allowed accounts and the clock.
type Config struct {
	Users []Credential
	// Now is the clock; nil uses time.Now.
	Now func() time.Time
}

// SessionLifetime is how long a session lasts after login.
const SessionLifetime = 7 * 24 * time.Hour

// Service checks passwords, throttles failed logins, and creates, reads, and ends sessions.
type Service struct {
	store   Store
	now     func() time.Time
	users   map[string]Credential
	dummy   []byte
	compare func(hash, password []byte) error
	limiter *loginLimiter
}

// New validates the configured accounts and signs out every stored session whose account was
// removed or whose password hash changed. An invalid configuration is ledger.ErrInvalid.
func New(ctx context.Context, store Store, config Config) (*Service, error) {
	if config.Now == nil {
		config.Now = time.Now
	}
	s := &Service{store: store, now: config.Now, users: map[string]Credential{}, compare: bcrypt.CompareHashAndPassword}
	if len(config.Users) == 0 || len(config.Users) > 100 {
		return nil, ledger.ErrInvalid
	}
	dummyCost := bcrypt.MinCost
	for _, u := range config.Users {
		email, e := ledger.NormalizeEmail(u.Email)
		if e != nil || len(u.Name) > 120 {
			return nil, ledger.ErrInvalid
		}
		if _, exists := s.users[email]; exists {
			return nil, ledger.ErrInvalid
		}
		cost, e := bcrypt.Cost([]byte(u.PasswordHash))
		if e != nil || cost < 10 || cost > 14 {
			return nil, ledger.ErrInvalid
		}
		dummyCost = max(dummyCost, cost)
		u.Email = email
		s.users[email] = u
	}
	allowed := map[string]string{}
	emails := []string{}
	for email, u := range s.users {
		allowed[email] = digest(u.PasswordHash)
		emails = append(emails, email)
	}
	s.limiter = newLoginLimiter(config.Now, emails)
	if e := store.ReconcileSessions(ctx, allowed); e != nil {
		return nil, e
	}
	// Unknown emails are checked against a dummy hash at the slowest configured cost, so a wrong
	// password takes at least as long for an unknown email as for an allowed one.
	var e error
	if s.dummy, e = bcrypt.GenerateFromPassword([]byte("unconfigured-account-dummy"), dummyCost); e != nil {
		return nil, e
	}
	return s, nil
}

// ErrLoginFailed is the one answer to a wrong email or password, so it never reveals which.
var ErrLoginFailed = &ledger.Error{Code: ledger.CodeUnauthenticated, Message: "The email or password is incorrect."}

// RateLimited refuses a login attempt while the client address or the account is throttled.
type RateLimited struct {
	// Wait is how long until the next attempt is allowed.
	Wait time.Duration
}

func (e *RateLimited) Error() string { return "too many sign-in attempts" }

// LoginRequest is one sign-in attempt. Address identifies the client for throttling (see ADR
// 0009); PreviousToken is the session the client already holds, which a new login replaces.
type LoginRequest struct {
	Email, Password string
	Address         string
	PreviousToken   string
}

// Login is a successful sign-in: the member and the new session's token.
type Login struct {
	User  ledger.User
	Token string
}

// Login checks the password and creates a session. Every attempt runs exactly one password
// comparison, so a wrong password costs the same time for any email and length. A throttled
// attempt is *RateLimited and runs none. When the result carries a User, the member is known even
// if a later step failed.
func (s *Service) Login(ctx context.Context, in LoginRequest) (Login, error) {
	var out Login
	email, e := ledger.NormalizeEmail(in.Email)
	account := email
	if e != nil {
		account = "invalid email"
	}
	if wait := s.limiter.begin(in.Address, account); wait > 0 {
		return out, &RateLimited{Wait: wait}
	}
	credential, exists := s.users[email]
	hash := s.dummy
	if exists {
		hash = []byte(credential.PasswordHash)
	}
	// bcrypt reads at most 72 bytes; a longer password is compared on its prefix and then refused,
	// so rejecting it costs the same time as any other wrong password.
	password := []byte(in.Password)
	tooLong := len(password) > 72
	if tooLong {
		password = password[:72]
	}
	e = s.compare(hash, password)
	if e != nil || !exists || tooLong {
		return out, ErrLoginFailed
	}
	s.limiter.succeeded(in.Address, account)
	if out.User, e = s.store.EnsureUser(ctx, email, credential.Name); e != nil {
		return Login{}, e
	}
	var raw [32]byte
	if _, e = rand.Read(raw[:]); e != nil {
		return out, e
	}
	token := hex.EncodeToString(raw[:])
	if in.PreviousToken != "" {
		if e = s.store.DeleteSession(ctx, digest(in.PreviousToken)); e != nil {
			return out, e
		}
	}
	now := s.now()
	if e = s.store.SaveSession(ctx, digest(token), out.User.ID, digest(credential.PasswordHash), now.Add(SessionLifetime), now); e != nil {
		return out, e
	}
	out.Token = token
	return out, nil
}

// Authenticate returns the member a session token belongs to. The session must be unexpired, and
// its account must still be configured with the password hash it was created with.
func (s *Service) Authenticate(ctx context.Context, token string) (ledger.User, error) {
	if len(token) != 64 {
		return ledger.User{}, ledger.ErrUnauthorized
	}
	u, hash, e := s.store.Session(ctx, digest(token), s.now())
	if e != nil {
		return ledger.User{}, e
	}
	credential, ok := s.users[u.Email]
	if !ok || digest(credential.PasswordHash) != hash {
		return ledger.User{}, ledger.ErrUnauthorized
	}
	return u, nil
}

// Logout ends the session with this token.
func (s *Service) Logout(ctx context.Context, token string) error {
	return s.store.DeleteSession(ctx, digest(token))
}

// digest is how tokens and credentials are stored: never in the clear.
func digest(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
