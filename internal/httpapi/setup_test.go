package httpapi_test

import (
	"context"
	"log/slog"
	"net/http"
	"net/netip"
	"testing"
	"time"

	"simply-finance/internal/apptest"
	"simply-finance/internal/auth"
	"simply-finance/internal/httpapi"
)

// openPrepared migrates, opens, and seeds a temporary SQLite database with the use cases over it.
func openPrepared(t *testing.T, path string, now func() time.Time) (*apptest.Household, error) {
	t.Helper()
	return apptest.Open(path, now)
}

// testConfig is everything a test chooses about a server: the accounts and clock go to auth, the
// rest to the HTTP layer.
type testConfig struct {
	Users           []auth.Credential
	Origin          string
	InsecureCookies bool
	Now             func() time.Time
	TrustedProxies  []netip.Prefix
	Logger          *slog.Logger
}

// newHandler wires the API over a prepared household as serve does, with real authentication.
func newHandler(s *apptest.Household, c testConfig) (http.Handler, error) {
	a, e := auth.New(context.Background(), s.Store, auth.Config{Users: c.Users, Now: c.Now})
	if e != nil {
		return nil, e
	}
	return httpapi.New(httpapi.Deps{Finance: s.Service, Auth: a, Ready: s.Store.Health}, httpapi.Config{Origin: c.Origin, InsecureCookies: c.InsecureCookies, TrustedProxies: c.TrustedProxies, Logger: c.Logger})
}
