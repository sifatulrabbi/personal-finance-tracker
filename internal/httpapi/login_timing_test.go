package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"simply-finance/internal/apptest"
	"simply-finance/internal/sqlite"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func timingServer(t *testing.T) *Server {
	t.Helper()
	path := filepath.Join(t.TempDir(), "timing.sqlite")
	if e := sqlite.Migrate(path); e != nil {
		t.Fatal(e)
	}
	db, e := sqlite.Open(path)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { db.Close() })
	store := apptest.Wrap(db, time.Now)
	var users []Credential
	for i, cost := range []int{10, 11} {
		h, e := bcrypt.GenerateFromPassword([]byte("correct horse battery"), cost)
		if e != nil {
			t.Fatal(e)
		}
		users = append(users, Credential{Email: []string{"low@example.test", "high@example.test"}[i], PasswordHash: string(h)})
	}
	s, e := newServer(store.Service, store.Store, Config{Users: users, Origin: "http://localhost:8080", InsecureCookies: true})
	if e != nil {
		t.Fatal(e)
	}
	return s
}

// Regression (S1): the dummy hash was fixed at cost 10 while real hashes used 12, so a wrong
// password for an unknown email answered about four times faster.
func TestDummyHashUsesTheHighestConfiguredCost(t *testing.T) {
	cost, e := bcrypt.Cost(timingServer(t).dummy)
	if e != nil || cost != 11 {
		t.Fatalf("dummy cost %d %v, want 11", cost, e)
	}
}

// Regression (S1): over-long passwords returned before bcrypt ran, which answered measurably
// faster than a normal wrong password. Every login attempt must run exactly one comparison.
func TestEveryLoginAttemptRunsOnePasswordComparison(t *testing.T) {
	s := timingServer(t)
	calls := 0
	s.compare = func(hash, password []byte) error {
		calls++
		return bcrypt.CompareHashAndPassword(hash, password)
	}
	h := s.handler()
	long := strings.Repeat("x", 73)
	for _, tc := range []struct{ email, password string }{
		{"low@example.test", "wrong"},
		{"missing@example.test", "wrong"},
		{"low@example.test", long},
		{"missing@example.test", long},
		{"not an email", long},
	} {
		calls = 0
		body, _ := json.Marshal(map[string]string{"email": tc.email, "password": tc.password})
		r := httptest.NewRequest("POST", "http://localhost:8080/api/v1/login", bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Protection", "1")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 401 || calls != 1 {
			t.Errorf("%s with %d-byte password: status %d, comparisons %d", tc.email, len(tc.password), w.Code, calls)
		}
	}
}
