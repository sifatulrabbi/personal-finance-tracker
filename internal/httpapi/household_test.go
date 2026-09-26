package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"simply-finance/internal/finance"
	"simply-finance/internal/httpapi"
	"testing"
	"time"
)

// household is a real server over a migrated, seeded SQLite database with both members signed in
// through the login endpoint. The clock starts at 2026-09-14 12:00 UTC (18:00 in Dhaka).
type household struct {
	t      *testing.T
	base   string
	clock  *testClock
	store  *finance.Store
	me     *member
	spouse *member
}

type member struct {
	h      *household
	client *http.Client
}

func newHousehold(t *testing.T) *household {
	t.Helper()
	clock := &testClock{now: time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)}
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "household.sqlite"), clock.Now)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	handler, e := httpapi.New(s, httpapi.Config{Users: credentials(t), Origin: "http://localhost:47831", InsecureCookies: true, Now: clock.Now})
	if e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	h := &household{t: t, base: server.URL + "/api/v1", clock: clock, store: s}
	h.me = h.signIn("sifatul@example.test")
	h.spouse = h.signIn("wife@example.test")
	return h
}

func (h *household) signIn(email string) *member {
	h.t.Helper()
	jar, _ := cookiejar.New(nil)
	m := &member{h: h, client: &http.Client{Jar: jar}}
	m.ok("POST", "/login", map[string]string{"email": email, "password": goodPassword}, "", nil)
	return m
}

// do sends a JSON request (body nil for none) and returns the status and raw body.
func (m *member) do(method, path string, body any, key string) (int, []byte) {
	m.h.t.Helper()
	if body == nil {
		body = map[string]any{}
	}
	return request(m.h.t, m.client, method, m.h.base+path, body, key)
}

// ok requires a 200 and decodes the body into out when out is not nil.
func (m *member) ok(method, path string, body any, key string, out any) {
	m.h.t.Helper()
	status, data := m.do(method, path, body, key)
	if status != 200 {
		m.h.t.Fatalf("%s %s: %d %s", method, path, status, data)
	}
	if out != nil {
		if e := json.Unmarshal(data, out); e != nil {
			m.h.t.Fatalf("%s %s: %v %s", method, path, e, data)
		}
	}
}

// fails requires the given status and error code and returns the envelope.
func (m *member) fails(method, path string, body any, key string, status int, code string) envelope {
	m.h.t.Helper()
	got, data := m.do(method, path, body, key)
	var env envelope
	if e := json.Unmarshal(data, &env); e != nil || got != status || env.Error.Code != code {
		m.h.t.Fatalf("%s %s: got %d %s, want %d %s", method, path, got, data, status, code)
	}
	return env
}

func (m *member) wallet(id string) finance.Wallet {
	m.h.t.Helper()
	var w finance.Wallet
	m.ok("GET", "/wallets/"+id, nil, "", &w)
	return w
}
