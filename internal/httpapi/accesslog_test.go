package httpapi_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"simply-finance/internal/httpapi"
	"simply-finance/internal/ledger"
	"strings"
	"sync"
	"testing"
	"time"
)

type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}
func (s *syncBuffer) String() string { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

// Regression (S4): there was no access log or request ID, so an unexpected 500 could not be
// traced. Each API request now logs one structured line with the method, route pattern, status,
// duration, actor, and request ID, and never bodies, cookies, or query values.
func TestAccessLogRecordsRequestsWithoutPrivateData(t *testing.T) {
	var out syncBuffer
	logger := slog.New(slog.NewJSONHandler(&out, nil))
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "log.sqlite"), time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	h, e := httpapi.New(s.Service, s.Store, httpapi.Config{Users: credentials(t), Origin: "http://localhost:8080", InsecureCookies: true, Logger: logger})
	if e != nil {
		t.Fatal(e)
	}
	send := func(method, target, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://localhost:8080"+target, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Protection", "1")
		r.Header.Set("Idempotency-Key", "private-key-value")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	login := send("POST", "/api/v1/login", `{"email":"sifatul@example.test","password":"correct horse battery"}`, nil)
	if login.Code != 200 {
		t.Fatalf("login %d", login.Code)
	}
	var me ledger.User
	json.Unmarshal(login.Body.Bytes(), &me)
	cookie := login.Result().Cookies()[0]
	created := send("POST", "/api/v1/wallets", `{"name":"Secret stash name","type":"physical","opening_balance":"424242"}`, cookie)
	listed := send("GET", "/api/v1/transactions?limit=7&note=query-secret", "", cookie)
	missing := send("GET", "/api/v1/nowhere", "", nil)

	type line struct {
		Msg, Method, Route, RequestID, ActorID string
		Status                                 int
		Duration                               int64
	}
	lines := []line{}
	scanner := bufio.NewScanner(strings.NewReader(out.String()))
	for scanner.Scan() {
		var raw map[string]any
		if e := json.Unmarshal(scanner.Bytes(), &raw); e != nil {
			t.Fatalf("not JSON: %s", scanner.Text())
		}
		if raw["msg"] != "request" {
			continue
		}
		l := line{Msg: "request"}
		l.Method, _ = raw["method"].(string)
		l.Route, _ = raw["route"].(string)
		l.RequestID, _ = raw["request_id"].(string)
		l.ActorID, _ = raw["actor_id"].(string)
		status, _ := raw["status"].(float64)
		l.Status = int(status)
		duration, ok := raw["duration"].(float64)
		if !ok {
			t.Fatalf("no duration: %s", scanner.Text())
		}
		l.Duration = int64(duration)
		lines = append(lines, l)
	}
	if len(lines) != 4 {
		t.Fatalf("got %d request lines:\n%s", len(lines), out.String())
	}
	id := regexp.MustCompile(`^[0-9a-f]{32}$`)
	for i, want := range []struct {
		rec           *httptest.ResponseRecorder
		method, route string
		status        int
		actor         string
	}{
		{login, "POST", "POST /api/v1/login", 200, me.ID},
		{created, "POST", "POST /api/v1/wallets", 200, me.ID},
		{listed, "GET", "GET /api/v1/transactions", 200, me.ID},
		{missing, "GET", "/api/", 401, ""},
	} {
		got := lines[i]
		if got.Method != want.method || got.Route != want.route || got.Status != want.status || got.ActorID != want.actor {
			t.Errorf("line %d: %+v, want %+v", i, got, want)
		}
		if !id.MatchString(got.RequestID) || want.rec.Header().Get("X-Request-ID") != got.RequestID {
			t.Errorf("line %d: request id %q, header %q", i, got.RequestID, want.rec.Header().Get("X-Request-ID"))
		}
	}
	for _, private := range []string{"correct horse battery", "Secret stash", "424242", "query-secret", "limit=7", "private-key-value", cookie.Value} {
		if strings.Contains(out.String(), private) {
			t.Errorf("log contains %q", private)
		}
	}
}
