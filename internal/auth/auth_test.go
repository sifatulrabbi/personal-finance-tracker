package auth

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"simply-finance/internal/ledger"
	"simply-finance/internal/sqlite"
)

var ctx = context.Background()

type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *clock) Add(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

// store is a migrated SQLite database: sessions are always proven against real storage.
func store(t *testing.T) *sqlite.Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "auth.sqlite")
	if e := sqlite.Migrate(path); e != nil {
		t.Fatal(e)
	}
	s, e := sqlite.Open(path)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func hash(t *testing.T, password string, cost int) string {
	t.Helper()
	h, e := bcrypt.GenerateFromPassword([]byte(password), cost)
	if e != nil {
		t.Fatal(e)
	}
	return string(h)
}

// fast replaces bcrypt with a cheap comparison; the throttling and session logic is under test.
func fast(s *Service) {
	s.compare = func(hash, password []byte) error {
		if string(password) == "correct horse battery" {
			return nil
		}
		return errors.New("mismatch")
	}
}

func service(t *testing.T, st Store, c *clock, users ...Credential) *Service {
	t.Helper()
	s, e := New(ctx, st, Config{Users: users, Now: c.Now})
	if e != nil {
		t.Fatal(e)
	}
	fast(s)
	return s
}

func TestConfigurationIsValidated(t *testing.T) {
	good := hash(t, "correct horse battery", 10)
	for name, users := range map[string][]Credential{
		"no users":        nil,
		"bad email":       {{Email: "not an email", PasswordHash: good}},
		"duplicate email": {{Email: "a@b.test", PasswordHash: good}, {Email: "A@B.test", PasswordHash: good}},
		"long name":       {{Email: "a@b.test", PasswordHash: good, Name: strings.Repeat("x", 121)}},
		"not a hash":      {{Email: "a@b.test", PasswordHash: "plain"}},
		"cost too low":    {{Email: "a@b.test", PasswordHash: hash(t, "x", 4)}},
	} {
		if _, e := New(ctx, store(t), Config{Users: users}); !errors.Is(e, ledger.ErrInvalid) {
			t.Errorf("%s: %v", name, e)
		}
	}
	many := []Credential{}
	for i := 0; i < 101; i++ {
		many = append(many, Credential{Email: fmt.Sprintf("u%d@b.test", i), PasswordHash: good})
	}
	if _, e := New(ctx, store(t), Config{Users: many}); !errors.Is(e, ledger.ErrInvalid) {
		t.Fatalf("101 users: %v", e)
	}
}

func TestLoginSessionLifecycle(t *testing.T) {
	st := store(t)
	c := &clock{now: time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)}
	s := service(t, st, c, Credential{Email: "Sifatul@Example.test", PasswordHash: hash(t, "x", 10), Name: "Sifatul"})
	first, e := s.Login(ctx, LoginRequest{Email: " sifatul@example.TEST", Password: "correct horse battery", Address: "192.0.2.1"})
	if e != nil || len(first.Token) != 64 || first.User.Email != "sifatul@example.test" || first.User.Name != "Sifatul" {
		t.Fatalf("login: %+v %v", first, e)
	}
	u, e := s.Authenticate(ctx, first.Token)
	if e != nil || u.ID != first.User.ID {
		t.Fatalf("authenticate: %+v %v", u, e)
	}
	// A new login replaces the session the client already holds.
	second, e := s.Login(ctx, LoginRequest{Email: "sifatul@example.test", Password: "correct horse battery", Address: "192.0.2.1", PreviousToken: first.Token})
	if e != nil || second.User.ID != first.User.ID {
		t.Fatal(e)
	}
	if _, e = s.Authenticate(ctx, first.Token); !errors.Is(e, ledger.ErrUnauthorized) {
		t.Fatalf("replaced session still works: %v", e)
	}
	if e = s.Logout(ctx, second.Token); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Authenticate(ctx, second.Token); !errors.Is(e, ledger.ErrUnauthorized) {
		t.Fatalf("logged-out session still works: %v", e)
	}
	third, e := s.Login(ctx, LoginRequest{Email: "sifatul@example.test", Password: "correct horse battery", Address: "192.0.2.1"})
	if e != nil {
		t.Fatal(e)
	}
	c.Add(SessionLifetime - time.Second)
	if _, e = s.Authenticate(ctx, third.Token); e != nil {
		t.Fatalf("inside the lifetime: %v", e)
	}
	c.Add(time.Second)
	if _, e = s.Authenticate(ctx, third.Token); !errors.Is(e, ledger.ErrUnauthorized) {
		t.Fatalf("expired session: %v", e)
	}
	for _, token := range []string{"", "short", strings.Repeat("0", 64)} {
		if _, e = s.Authenticate(ctx, token); !errors.Is(e, ledger.ErrUnauthorized) {
			t.Errorf("token %q: %v", token, e)
		}
	}
}

func TestLoginFailuresRevealNothing(t *testing.T) {
	c := &clock{now: time.Now()}
	s := service(t, store(t), c, Credential{Email: "a@b.test", PasswordHash: hash(t, "x", 10)})
	for _, in := range []LoginRequest{
		{Email: "a@b.test", Password: "wrong"},
		{Email: "missing@b.test", Password: "correct horse battery"},
		{Email: "not an email", Password: "correct horse battery"},
		{Email: "a@b.test", Password: "correct horse battery" + strings.Repeat("x", 60)},
	} {
		in.Address = "192.0.2.1"
		out, e := s.Login(ctx, in)
		if e != ErrLoginFailed || out.User.ID != "" || out.Token != "" {
			t.Errorf("%q: %+v %v", in.Email, out, e)
		}
	}
}

// Changing or removing a configured credential signs out its sessions: at startup, and on the next
// request, because each session remembers the credential it was created with (ADR 0003).
func TestCredentialChangesRevokeSessions(t *testing.T) {
	st := store(t)
	c := &clock{now: time.Now()}
	old := Credential{Email: "a@b.test", PasswordHash: hash(t, "x", 10)}
	other := Credential{Email: "c@d.test", PasswordHash: hash(t, "x", 10)}
	s := service(t, st, c, old, other)
	login := func(s *Service, email string) string {
		out, e := s.Login(ctx, LoginRequest{Email: email, Password: "correct horse battery", Address: "192.0.2.1"})
		if e != nil {
			t.Fatal(e)
		}
		return out.Token
	}
	a, b := login(s, "a@b.test"), login(s, "c@d.test")
	changed := service(t, st, c, Credential{Email: "a@b.test", PasswordHash: hash(t, "y", 10)}, other)
	if _, e := changed.Authenticate(ctx, a); !errors.Is(e, ledger.ErrUnauthorized) {
		t.Fatalf("changed hash kept its session: %v", e)
	}
	if _, e := changed.Authenticate(ctx, b); e != nil {
		t.Fatalf("unchanged account lost its session: %v", e)
	}
	a = login(s, "a@b.test") // A service still holding the old hash creates a session...
	if _, e := changed.Authenticate(ctx, a); !errors.Is(e, ledger.ErrUnauthorized) {
		t.Fatalf("...which the current configuration refuses: %v", e)
	}
	removed := service(t, st, c, old)
	if _, e := removed.Authenticate(ctx, b); !errors.Is(e, ledger.ErrUnauthorized) {
		t.Fatalf("removed account kept its session: %v", e)
	}
}

func TestThrottledLoginsWaitAndRunNoComparison(t *testing.T) {
	c := &clock{now: time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)}
	s := service(t, store(t), c, Credential{Email: "a@b.test", PasswordHash: hash(t, "x", 10)})
	calls := 0
	compare := s.compare
	s.compare = func(h, p []byte) error { calls++; return compare(h, p) }
	for i := 0; i < accountBackoff.free; i++ {
		if _, e := s.Login(ctx, LoginRequest{Email: "a@b.test", Password: "wrong", Address: fmt.Sprintf("192.0.2.%d", i)}); e != ErrLoginFailed {
			t.Fatal(e)
		}
	}
	calls = 0
	_, e := s.Login(ctx, LoginRequest{Email: "a@b.test", Password: "correct horse battery", Address: "198.51.100.1"})
	var limited *RateLimited
	if !errors.As(e, &limited) || limited.Wait != 30*time.Second || calls != 0 {
		t.Fatalf("sixth failure: %v %+v calls=%d", e, limited, calls)
	}
	c.Add(30 * time.Second)
	if _, e = s.Login(ctx, LoginRequest{Email: "a@b.test", Password: "correct horse battery", Address: "198.51.100.1"}); e != nil {
		t.Fatalf("after the wait: %v", e)
	}
}

func TestBackoffDoublesToItsCap(t *testing.T) {
	now := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		count int
		since time.Duration
		want  time.Duration
	}{
		{4, 0, 0},
		{5, 0, 30 * time.Second},
		{6, 0, time.Minute},
		{5, 10 * time.Second, 20 * time.Second},
		{9, 0, 8 * time.Minute},
		{10, 0, 15 * time.Minute},
		{100, 0, 15 * time.Minute},
		{100, time.Hour, 0},
	} {
		got := accountBackoff.wait(&failures{count: tc.count, last: now.Add(-tc.since)}, now)
		if got != tc.want {
			t.Errorf("%+v: %s", tc, got)
		}
	}
	if accountBackoff.wait(nil, now) != 0 {
		t.Fatal("no failures")
	}
}

// Regression (S1): the dummy hash was fixed at cost 10 while real hashes used 12, so a wrong
// password for an unknown email answered about four times faster.
func TestDummyHashUsesTheHighestConfiguredCost(t *testing.T) {
	s, e := New(ctx, store(t), Config{Users: []Credential{{Email: "low@example.test", PasswordHash: hash(t, "x", 10)}, {Email: "high@example.test", PasswordHash: hash(t, "x", 11)}}})
	if e != nil {
		t.Fatal(e)
	}
	cost, e := bcrypt.Cost(s.dummy)
	if e != nil || cost != 11 {
		t.Fatalf("dummy cost %d %v, want 11", cost, e)
	}
}

// Regression (S1): over-long passwords returned before bcrypt ran, which answered measurably
// faster than a normal wrong password. Every login attempt must run exactly one comparison.
func TestEveryLoginAttemptRunsOnePasswordComparison(t *testing.T) {
	s, e := New(ctx, store(t), Config{Users: []Credential{{Email: "low@example.test", PasswordHash: hash(t, "correct horse battery", 10)}}})
	if e != nil {
		t.Fatal(e)
	}
	calls := 0
	s.compare = func(hash, password []byte) error {
		calls++
		return bcrypt.CompareHashAndPassword(hash, password)
	}
	long := strings.Repeat("x", 73)
	for _, tc := range []struct{ email, password string }{
		{"low@example.test", "wrong"},
		{"missing@example.test", "wrong"},
		{"low@example.test", long},
		{"missing@example.test", long},
		{"not an email", long},
	} {
		calls = 0
		if _, e := s.Login(ctx, LoginRequest{Email: tc.email, Password: tc.password, Address: "192.0.2.1"}); e != ErrLoginFailed || calls != 1 {
			t.Errorf("%s with %d-byte password: %v, comparisons %d", tc.email, len(tc.password), e, calls)
		}
	}
}

// Regression (S2): once 1,024 addresses were tracked, every new address was refused, so a spray of
// addresses locked the household out. A full table now forgets its oldest entry instead.
func TestAFullTrackingTableNeverRefusesEveryone(t *testing.T) {
	c := &clock{now: time.Now()}
	s := service(t, store(t), c, Credential{Email: "low@example.test", PasswordHash: hash(t, "x", 10)})
	login := func(address, email, password string) error {
		_, e := s.Login(ctx, LoginRequest{Email: email, Password: password, Address: address})
		return e
	}
	spray := addressTableSize + 500
	for i := 0; i < spray; i++ {
		if e := login(fmt.Sprintf("100.%d.%d.%d", 64+i>>16, byte(i>>8), byte(i)), fmt.Sprintf("spray%d@example.test", i), "wrong"); e != ErrLoginFailed {
			t.Fatalf("spray %d: %v", i, e)
		}
	}
	if n := s.limiter.addresses.len(); n > addressTableSize {
		t.Fatalf("address table grew to %d", n)
	}
	if n := s.limiter.unknown.len(); n > unknownAccountTableSize {
		t.Fatalf("unknown-account table grew to %d", n)
	}
	if e := login("198.51.100.9", "low@example.test", "correct horse battery"); e != nil {
		t.Fatalf("household member after a spray: %v", e)
	}
	if e := login("198.51.100.10", "nobody@example.test", "wrong"); e != ErrLoginFailed {
		t.Fatalf("new address after a spray: %v", e)
	}
}
