package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"simply-finance/internal/httpapi"
)

func TestFrontendServesOnlyPublicFilesAndPreservesAPI(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>Simply Finance</h1>"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "assets"), 0700); err != nil {
		t.Fatal(err)
	}
	h := httpapi.WithFrontend(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401) }), dir)
	for _, tc := range []struct {
		path   string
		status int
	}{{"/", 200}, {"/api/v1/wallets", 401}, {"/assets/", 404}, {"/.env", 404}, {"/../finance.sqlite", 404}} {
		r := httptest.NewRecorder()
		h.ServeHTTP(r, httptest.NewRequest("GET", tc.path, nil))
		if r.Code != tc.status {
			t.Fatalf("%s: %d", tc.path, r.Code)
		}
		if tc.path == "/" && !strings.Contains(r.Header().Get("Content-Security-Policy"), "script-src 'self'") {
			t.Fatal("missing frontend CSP")
		}
	}
}
