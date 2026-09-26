package httpapi_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"simply-finance/internal/httpapi"
	"strconv"
	"sync"
	"testing"
	"time"
)

type testClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *testClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.now }
func (c *testClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

type loginProbe struct {
	t       *testing.T
	handler http.Handler
	clock   *testClock
}

func limitServer(t *testing.T, trusted string) loginProbe {
	t.Helper()
	clock := &testClock{now: time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)}
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "limit.sqlite"), clock.Now)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.Close() })
	proxies, e := httpapi.ParseTrustedProxies(trusted)
	if e != nil {
		t.Fatal(e)
	}
	h, e := httpapi.New(s, httpapi.Config{Users: credentials(t), Origin: "http://localhost:8080", InsecureCookies: true, Now: clock.Now, TrustedProxies: proxies})
	if e != nil {
		t.Fatal(e)
	}
	return loginProbe{t, h, clock}
}

// login sends one login from remote (host:port) with an optional X-Forwarded-For header and
// returns the status and the Retry-After seconds (0 when absent).
func (p loginProbe) login(remote, forwarded, email, password string) (int, int) {
	p.t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	r := httptest.NewRequest("POST", "http://localhost:8080/api/v1/login", bytes.NewReader(body))
	r.RemoteAddr = remote
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-CSRF-Protection", "1")
	if forwarded != "" {
		r.Header.Set("X-Forwarded-For", forwarded)
	}
	w := httptest.NewRecorder()
	p.handler.ServeHTTP(w, r)
	retry := 0
	if v := w.Header().Get("Retry-After"); v != "" {
		var e error
		if retry, e = strconv.Atoi(v); e != nil || retry < 1 {
			p.t.Fatalf("Retry-After %q", v)
		}
	}
	return w.Code, retry
}

const goodPassword = "correct horse battery"

// Regression (S2): behind a reverse proxy every client shared the proxy's address, so ten wrong
// attempts from anyone locked the whole household out. With the proxy trusted, the limit follows
// the right-most untrusted X-Forwarded-For address, which a client cannot forge by prepending.
func TestLoginLimitFollowsTheClientBehindATrustedProxy(t *testing.T) {
	t.Parallel() // real bcrypt comparisons are slow under the race detector
	p := limitServer(t, "10.0.0.0/8")
	proxy := "10.0.0.2:5000"
	locked := false
	for i := 0; i < 40 && !locked; i++ {
		// The attacker forges a different left-most address each time; the proxy appends the real one.
		status, _ := p.login(proxy, fmt.Sprintf("198.18.0.%d, 203.0.113.9", i), fmt.Sprintf("guess%d@example.test", i), "wrong")
		locked = status == 429
	}
	if !locked {
		t.Fatal("repeated failures from one client behind the proxy were never limited")
	}
	if status, _ := p.login(proxy, "198.51.100.7", "wife@example.test", goodPassword); status != 200 {
		t.Fatalf("another household member behind the same proxy: %d", status)
	}
}

// An untrusted peer's X-Forwarded-For is ignored, so a client cannot pick its own limit key.
func TestLoginLimitIgnoresForwardedHeaderFromUntrustedPeers(t *testing.T) {
	t.Parallel() // real bcrypt comparisons are slow under the race detector
	p := limitServer(t, "10.0.0.0/8")
	locked := false
	for i := 0; i < 40 && !locked; i++ {
		status, _ := p.login("203.0.113.9:4000", fmt.Sprintf("198.18.0.%d", i), fmt.Sprintf("guess%d@example.test", i), "wrong")
		locked = status == 429
	}
	if !locked {
		t.Fatal("rotating a forged X-Forwarded-For from an untrusted peer escaped the limit")
	}
}

// IPv6 clients are limited per /64, so rotating addresses inside one allocation does not help.
func TestLoginLimitGroupsIPv6AddressesByPrefix(t *testing.T) {
	t.Parallel() // real bcrypt comparisons are slow under the race detector
	p := limitServer(t, "")
	locked := false
	for i := 0; i < 40 && !locked; i++ {
		status, _ := p.login(fmt.Sprintf("[2001:db8:1:2::%x]:443", i+1), "", fmt.Sprintf("guess%d@example.test", i), "wrong")
		locked = status == 429
	}
	if !locked {
		t.Fatal("rotating IPv6 addresses within one /64 escaped the limit")
	}
}

// Per-account limit with growing waits: wrong passwords for one account from many addresses lock
// that account only, and each wait after the lock is longer than the one before.
func TestLoginLimitPerAccountBacksOffAndSparesOtherAccounts(t *testing.T) {
	t.Parallel() // real bcrypt comparisons are slow under the race detector
	p := limitServer(t, "")
	var status, first int
	for i := 0; i < 20; i++ {
		if status, first = p.login(fmt.Sprintf("192.0.2.%d:1000", i+1), "", "sifatul@example.test", "wrong"); status == 429 {
			break
		}
	}
	if status != 429 || first == 0 {
		t.Fatalf("account never limited: %d", status)
	}
	if status, _ := p.login("198.51.100.1:1000", "", "sifatul@example.test", goodPassword); status != 429 {
		t.Fatalf("locked account accepted a login from a new address: %d", status)
	}
	if status, _ := p.login("198.51.100.1:1000", "", "wife@example.test", goodPassword); status != 200 {
		t.Fatalf("other account: %d", status)
	}
	p.clock.Advance(time.Duration(first) * time.Second)
	if status, _ := p.login("198.51.100.2:1000", "", "sifatul@example.test", "wrong"); status != 401 {
		t.Fatalf("after waiting: %d", status)
	}
	status, second := p.login("198.51.100.3:1000", "", "sifatul@example.test", "wrong")
	if status != 429 || second <= first {
		t.Fatalf("backoff did not grow: %d, %ds then %ds", status, first, second)
	}
	// Long quiet periods forget old failures.
	p.clock.Advance(2 * time.Hour)
	if status, _ := p.login("198.51.100.4:1000", "", "sifatul@example.test", goodPassword); status != 200 {
		t.Fatalf("after the failures expired: %d", status)
	}
}

// Regression (S2): successful logins counted toward the limit. Now they don't, and a success
// clears the account's earlier failures.
func TestSuccessfulLoginsDoNotCountAndResetTheAccount(t *testing.T) {
	t.Parallel() // real bcrypt comparisons are slow under the race detector
	p := limitServer(t, "")
	for i := 0; i < 25; i++ {
		if status, _ := p.login("192.0.2.1:1000", "", "wife@example.test", goodPassword); status != 200 {
			t.Fatalf("success %d: %d", i, status)
		}
	}
	for round := 0; round < 3; round++ {
		for i := 0; i < 4; i++ {
			if status, _ := p.login(fmt.Sprintf("192.0.2.%d:1000", 10+round*4+i), "", "sifatul@example.test", "wrong"); status != 401 {
				t.Fatalf("round %d failure %d: %d", round, i, status)
			}
		}
		if status, _ := p.login("192.0.2.100:1000", "", "sifatul@example.test", goodPassword); status != 200 {
			t.Fatalf("round %d success: %d", round, status)
		}
	}
}

func TestParseTrustedProxies(t *testing.T) {
	got, e := httpapi.ParseTrustedProxies(" 10.0.0.0/8, 192.168.1.5 ,::1 ")
	if e != nil || len(got) != 3 || got[1].String() != "192.168.1.5/32" || got[2].String() != "::1/128" {
		t.Fatalf("%v %v", got, e)
	}
	if got, e = httpapi.ParseTrustedProxies(""); e != nil || len(got) != 0 {
		t.Fatalf("empty: %v %v", got, e)
	}
	for _, bad := range []string{"10.0.0.0/33", "proxy.local", "10.0.0.1,,"} {
		if _, e = httpapi.ParseTrustedProxies(bad); e == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}
