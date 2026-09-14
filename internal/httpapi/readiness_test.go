package httpapi_test

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"simply-finance/internal/finance"
	"simply-finance/internal/httpapi"
)

func TestHTTPSRejectsInsecureSessionConfiguration(t *testing.T) {
	s, e := finance.Open(filepath.Join(t.TempDir(), "test.sqlite"), time.Now)
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
	s, e := finance.Open(filepath.Join(t.TempDir(), "test.sqlite"), time.Now)
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
