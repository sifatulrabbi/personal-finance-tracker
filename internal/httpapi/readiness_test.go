package httpapi_test

import (
	"database/sql"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"simply-finance/internal/finance"
	"simply-finance/internal/httpapi"
)

func TestHandlerStartupDoesNotSeedUserProfiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.sqlite")
	s, err := openPrepared(t, path, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	users := credentials(t)
	if _, err = httpapi.New(s, httpapi.Config{Users: users, Origin: "https://finance.example.test"}); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM users`).Scan(&count); err != nil || count != 0 {
		t.Fatal("startup seeded users", count, err)
	}
	users[0].Name = strings.Repeat("x", 121)
	if _, err = httpapi.New(s, httpapi.Config{Users: users, Origin: "https://finance.example.test"}); err != finance.ErrInvalid {
		t.Fatal("invalid profile name accepted", err)
	}
}

func TestHTTPSRejectsInsecureSessionConfiguration(t *testing.T) {
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "test.sqlite"), time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	users := credentials(t)
	for _, tc := range []struct {
		origin   string
		insecure bool
		valid    bool
	}{
		{"https://finance.example.test", true, false},
		{"https://finance.example.test", false, true},
		{"http://localhost:47831", true, true},
		{"http://localhost:47831", false, false},
	} {
		_, e := httpapi.New(s, httpapi.Config{Users: users, Origin: tc.origin, InsecureCookies: tc.insecure})
		if tc.valid && e != nil {
			t.Errorf("valid config rejected: %s insecure=%v: %v", tc.origin, tc.insecure, e)
		}
		if !tc.valid && e != finance.ErrInvalid {
			t.Errorf("unsafe config accepted: %s insecure=%v: %v", tc.origin, tc.insecure, e)
		}
	}
}

func TestHealthReportsUnavailableDatabase(t *testing.T) {
	s, e := openPrepared(t, filepath.Join(t.TempDir(), "test.sqlite"), time.Now)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	h, e := httpapi.New(s, httpapi.Config{Users: credentials(t), Origin: "https://finance.example.test"})
	if e != nil {
		t.Fatal(e)
	}
	check := func(want int) {
		t.Helper()
		response := httptest.NewRecorder()
		h.ServeHTTP(response, httptest.NewRequest("GET", "/healthz", nil))
		if response.Code != want {
			t.Fatalf("health: got %d, want %d", response.Code, want)
		}
	}
	check(200)
	if e = s.Close(); e != nil {
		t.Fatal(e)
	}
	check(503)
}
