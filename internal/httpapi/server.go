package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"simply-finance/internal/app"
	"simply-finance/internal/auth"
	"simply-finance/internal/ledger"
	"time"
)

type Config struct {
	Origin          string
	InsecureCookies bool
	// TrustedProxies are the reverse proxies whose X-Forwarded-For header names the client for
	// login throttling. Empty means the connecting address is the client.
	TrustedProxies []netip.Prefix
	// Logger receives the access log; nil uses slog.Default().
	Logger *slog.Logger
}

// Deps are the services the HTTP API adapts. The transport holds no financial rules and no
// credentials of its own.
type Deps struct {
	Finance *app.Service
	Auth    *auth.Service
	// Ready reports whether the database answers; it backs /healthz.
	Ready func(context.Context) error
}

type Server struct {
	app    *app.Service
	auth   *auth.Service
	ready  func(context.Context) error
	config Config
	logger *slog.Logger
}
type actorKey struct{}

func New(deps Deps, config Config) (http.Handler, error) {
	s, e := newServer(deps, config)
	if e != nil {
		return nil, e
	}
	return s.handler(), nil
}

// newServer checks the origin configuration: HTTP origins need insecure cookies and HTTPS origins
// need secure ones. A bad configuration is ledger.ErrInvalid.
func newServer(deps Deps, config Config) (*Server, error) {
	if deps.Finance == nil || deps.Auth == nil || deps.Ready == nil {
		return nil, errors.New("httpapi: finance, auth, and readiness services are required")
	}
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	origin, e := url.Parse(config.Origin)
	if e != nil || origin.Host == "" || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" || origin.User != nil {
		return nil, ledger.ErrInvalid
	}
	if config.InsecureCookies != (origin.Scheme == "http") {
		return nil, ledger.ErrInvalid
	}
	return &Server{app: deps.Finance, auth: deps.Auth, ready: deps.Ready, config: config, logger: config.Logger}, nil
}

// handler is the whole API: the public health and login endpoints, then every other /api/ path
// behind authentication, all inside the access log and the security headers and checks.
func (s *Server) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /api/v1/login", s.login)
	private := http.NewServeMux()
	s.routes(private)
	mux.Handle("/api/", s.authenticate(jsonErrors(private)))
	return s.accessLog(s.security(jsonErrors(mux)))
}

// health reports readiness outside the API: it keeps its {"status":...} body (ADR 0008).
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if e := s.ready(ctx); e != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"status": "unavailable"})
		return
	}
	respond(w, map[string]string{"status": "ok"}, nil)
}
