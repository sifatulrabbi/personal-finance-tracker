package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"simply-finance/internal/finance"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Credential struct {
	Email        string `json:"email"`
	PasswordHash string `json:"password_hash"`
	Name         string `json:"name"`
}
type Config struct {
	Users           []Credential
	Origin          string
	InsecureCookies bool
	Now             func() time.Time
}
type Server struct {
	store    *finance.Store
	config   Config
	users    map[string]Credential
	dummy    []byte
	mu       sync.Mutex
	attempts map[string]attempt
}
type attempt struct {
	count int
	until time.Time
}
type actorKey struct{}

func New(store *finance.Store, config Config) (http.Handler, error) {
	if config.Now == nil {
		config.Now = time.Now
	}
	origin, e := url.Parse(config.Origin)
	if e != nil || origin.Host == "" || (origin.Scheme != "http" && origin.Scheme != "https") || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" || origin.User != nil {
		return nil, finance.ErrInvalid
	}
	if config.InsecureCookies != (origin.Scheme == "http") {
		return nil, finance.ErrInvalid
	}
	s := &Server{store: store, config: config, users: map[string]Credential{}, attempts: map[string]attempt{}}
	if len(config.Users) == 0 || len(config.Users) > 100 {
		return nil, finance.ErrInvalid
	}
	for _, u := range config.Users {
		email, e := finance.NormalizeEmail(u.Email)
		if e != nil || len(u.Name) > 120 {
			return nil, finance.ErrInvalid
		}
		if _, exists := s.users[email]; exists {
			return nil, finance.ErrInvalid
		}
		cost, e := bcrypt.Cost([]byte(u.PasswordHash))
		if e != nil || cost < 10 || cost > 14 {
			return nil, finance.ErrInvalid
		}
		u.Email = email
		s.users[email] = u
	}
	allowed := map[string]string{}
	for email, u := range s.users {
		allowed[email] = digest(u.PasswordHash)
	}
	if e = store.ReconcileSessions(context.Background(), allowed); e != nil {
		return nil, e
	}
	s.dummy, e = bcrypt.GenerateFromPassword([]byte("unconfigured-account-dummy"), 10)
	if e != nil {
		return nil, e
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if e := s.store.Health(ctx); e != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]string{"status": "unavailable"})
			return
		}
		respond(w, map[string]string{"status": "ok"}, nil)
	})
	mux.HandleFunc("POST /api/v1/login", s.login)
	private := http.NewServeMux()
	private.HandleFunc("GET /api/v1/me", func(w http.ResponseWriter, r *http.Request) { respond(w, actor(r), nil) })
	private.HandleFunc("POST /api/v1/logout", s.logout)
	private.HandleFunc("GET /api/v1/categories", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.store.Categories(r.Context())
		respond(w, v, e)
	})
	private.HandleFunc("POST /api/v1/categories", input(func(r *http.Request, in finance.CategoryInput) (any, error) {
		return s.store.CreateCategory(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("GET /api/v1/monthly", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.store.Monthly(r.Context(), r.URL.Query().Get("month"))
		respond(w, v, e)
	})
	private.HandleFunc("PUT /api/v1/monthly/{month}/target", input(func(r *http.Request, in struct {
		Amount  string `json:"amount"`
		Version int    `json:"version"`
	}) (any, error) {
		return s.store.SetMonthlyTarget(r.Context(), actor(r).ID, key(r), r.PathValue("month"), in.Amount, in.Version)
	}))
	private.HandleFunc("GET /api/v1/wallets", func(w http.ResponseWriter, r *http.Request) { v, e := s.store.Wallets(r.Context()); respond(w, v, e) })
	private.HandleFunc("POST /api/v1/wallets", input(func(r *http.Request, in finance.WalletInput) (any, error) {
		return s.store.CreateWallet(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("PUT /api/v1/wallets/{id}", input(func(r *http.Request, in finance.Wallet) (any, error) {
		if in.ID != r.PathValue("id") {
			return nil, finance.ErrInvalid
		}
		return s.store.UpdateWallet(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("POST /api/v1/wallets/{id}/adjust", input(func(r *http.Request, in struct {
		Version int    `json:"version"`
		Balance string `json:"balance"`
		Reason  string `json:"reason"`
	}) (any, error) {
		return s.store.AdjustWallet(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Version, in.Balance, in.Reason)
	}))
	private.HandleFunc("GET /api/v1/transactions", func(w http.ResponseWriter, r *http.Request) {
		l, o, e := page(r)
		if e != nil {
			respond(w, nil, e)
			return
		}
		v, e := s.store.Transactions(r.Context(), l, o)
		respond(w, v, e)
	})
	private.HandleFunc("POST /api/v1/transactions", input(func(r *http.Request, in finance.TransactionInput) (any, error) {
		return s.store.CreateTransaction(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("PUT /api/v1/transactions/{id}", input(func(r *http.Request, in struct {
		finance.TransactionInput
		Version int `json:"version"`
	}) (any, error) {
		return s.store.ReviseTransaction(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Version, in.TransactionInput, false)
	}))
	private.HandleFunc("POST /api/v1/transactions/{id}/void", input(func(r *http.Request, in struct {
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}) (any, error) {
		return s.store.ReviseTransaction(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Version, finance.TransactionInput{Reason: in.Reason}, true)
	}))
	private.HandleFunc("GET /api/v1/transactions/{id}/history", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.store.History(r.Context(), r.PathValue("id"))
		respond(w, v, e)
	})
	private.HandleFunc("GET /api/v1/settings", func(w http.ResponseWriter, r *http.Request) { v, e := s.store.Settings(r.Context()); respond(w, v, e) })
	private.HandleFunc("PUT /api/v1/settings", input(func(r *http.Request, in struct {
		Rate    string `json:"rate"`
		Version int    `json:"version"`
	}) (any, error) {
		return s.store.SetRate(r.Context(), actor(r).ID, key(r), in.Rate, in.Version)
	}))
	private.HandleFunc("GET /api/v1/schedules", func(w http.ResponseWriter, r *http.Request) { v, e := s.store.Schedules(r.Context()); respond(w, v, e) })
	private.HandleFunc("POST /api/v1/schedules", input(func(r *http.Request, in finance.ScheduleInput) (any, error) {
		return s.store.CreateSchedule(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("PUT /api/v1/schedules/{id}", input(func(r *http.Request, in finance.Schedule) (any, error) {
		if in.ID != r.PathValue("id") {
			return nil, finance.ErrInvalid
		}
		return s.store.UpdateSchedule(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("GET /api/v1/bills/due", func(w http.ResponseWriter, r *http.Request) { v, e := s.store.Due(r.Context()); respond(w, v, e) })
	private.HandleFunc("POST /api/v1/bills/{id}/confirm", input(func(r *http.Request, in finance.PaymentInput) (any, error) {
		return s.store.ConfirmBill(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in)
	}))
	private.HandleFunc("POST /api/v1/bills/{id}/skip", input(func(r *http.Request, in struct {
		Reason string `json:"reason"`
	}) (any, error) {
		return s.store.SkipBill(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Reason)
	}))
	private.HandleFunc("GET /api/v1/audit", func(w http.ResponseWriter, r *http.Request) {
		l, o, e := page(r)
		if e != nil {
			respond(w, nil, e)
			return
		}
		v, e := s.store.Audit(r.Context(), l, o)
		respond(w, v, e)
	})
	mux.Handle("/api/", s.authenticate(private))
	return s.security(mux), nil
}
func actor(r *http.Request) finance.User { return r.Context().Value(actorKey{}).(finance.User) }
func key(r *http.Request) string         { return r.Header.Get("Idempotency-Key") }
func input[T any](fn func(*http.Request, T) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in T
		if e := decode(w, r, &in); e != nil {
			respond(w, nil, e)
			return
		}
		v, e := fn(r, in)
		respond(w, v, e)
	}
}
func decode(w http.ResponseWriter, r *http.Request, out any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	defer r.Body.Close()
	b, e := io.ReadAll(r.Body)
	if e != nil {
		return finance.ErrInvalid
	}
	if len(strings.TrimSpace(string(b))) == 0 || strings.TrimSpace(string(b))[0] != '{' {
		return finance.ErrInvalid
	}
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.DisallowUnknownFields()
	if e = dec.Decode(out); e != nil {
		return finance.ErrInvalid
	}
	if e = dec.Decode(&struct{}{}); e != io.EOF {
		return finance.ErrInvalid
	}
	return nil
}
func respond(w http.ResponseWriter, v any, e error) {
	w.Header().Set("Content-Type", "application/json")
	if e != nil {
		status := 500
		message := "internal server error"
		switch {
		case errors.Is(e, finance.ErrInvalid):
			status = 400
			message = e.Error()
		case errors.Is(e, finance.ErrUnauthorized):
			status = 401
			message = e.Error()
		case errors.Is(e, finance.ErrNotFound), errors.Is(e, sql.ErrNoRows):
			status = 404
			message = "record not found"
		case errors.Is(e, finance.ErrConflict):
			status = 409
			message = e.Error()
		default:
			slog.Error("request failed", "error_type", strings.SplitN(e.Error(), ":", 2)[0])
		}
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": message})
		return
	}
	json.NewEncoder(w).Encode(v)
}
func page(r *http.Request) (int, int, error) {
	l, o := 100, 0
	var e error
	if r.URL.Query().Get("limit") != "" {
		l, e = strconv.Atoi(r.URL.Query().Get("limit"))
		if e != nil {
			return 0, 0, finance.ErrInvalid
		}
	}
	if r.URL.Query().Get("offset") != "" {
		o, e = strconv.Atoi(r.URL.Query().Get("offset"))
		if e != nil {
			return 0, 0, finance.ErrInvalid
		}
	}
	return l, o, nil
}
func digest(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func (s *Server) cookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: "sf_session", Value: value, Path: "/", HttpOnly: true, Secure: !s.config.InsecureCookies, SameSite: http.SameSiteStrictMode, MaxAge: maxAge})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	host, _, e := net.SplitHostPort(r.RemoteAddr)
	if e != nil {
		host = r.RemoteAddr
	}
	if !s.allowLogin(host) {
		w.Header().Set("Retry-After", "60")
		w.WriteHeader(429)
		return
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if e = decode(w, r, &in); e != nil {
		respond(w, nil, e)
		return
	}
	email, _ := finance.NormalizeEmail(in.Email)
	credential, exists := s.users[email]
	hash := s.dummy
	if exists {
		hash = []byte(credential.PasswordHash)
	}
	if len(in.Password) > 72 {
		respond(w, nil, finance.ErrUnauthorized)
		return
	}
	e = bcrypt.CompareHashAndPassword(hash, []byte(in.Password))
	if e != nil || !exists {
		respond(w, nil, finance.ErrUnauthorized)
		return
	}
	user, e := s.store.EnsureUser(r.Context(), email, credential.Name)
	if e != nil {
		respond(w, nil, e)
		return
	}
	var raw [32]byte
	if _, e = rand.Read(raw[:]); e != nil {
		respond(w, nil, e)
		return
	}
	token := hex.EncodeToString(raw[:])
	if old, e := r.Cookie("sf_session"); e == nil {
		if e = s.store.DeleteSession(r.Context(), digest(old.Value)); e != nil {
			respond(w, nil, e)
			return
		}
	}
	if e = s.store.SaveSession(r.Context(), digest(token), user.ID, digest(credential.PasswordHash), s.config.Now().Add(7*24*time.Hour).Unix()); e != nil {
		respond(w, nil, e)
		return
	}
	s.cookie(w, token, 7*24*3600)
	respond(w, user, nil)
}
func (s *Server) allowLogin(host string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.config.Now()
	for k, v := range s.attempts {
		if !v.until.After(now) {
			delete(s.attempts, k)
		}
	}
	a, ok := s.attempts[host]
	if !ok {
		if len(s.attempts) >= 1024 {
			return false
		}
		a.until = now.Add(time.Minute)
	}
	a.count++
	s.attempts[host] = a
	return a.count <= 10
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	c, e := r.Cookie("sf_session")
	if e == nil {
		e = s.store.DeleteSession(r.Context(), digest(c.Value))
	}
	s.cookie(w, "", -1)
	respond(w, map[string]bool{"ok": true}, e)
}
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, e := r.Cookie("sf_session")
		if e != nil || len(c.Value) != 64 {
			respond(w, nil, finance.ErrUnauthorized)
			return
		}
		u, hash, e := s.store.Session(r.Context(), digest(c.Value))
		if e != nil {
			respond(w, nil, e)
			return
		}
		credential, ok := s.users[u.Email]
		if !ok || digest(credential.PasswordHash) != hash {
			respond(w, nil, finance.ErrUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), actorKey{}, u)))
	})
}
func (s *Server) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			media, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if r.Header.Get("X-CSRF-Protection") != "1" || (origin != "" && origin != s.config.Origin) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				http.Error(w, "request origin rejected", 403)
				return
			}
			if e != nil || media != "application/json" {
				http.Error(w, "JSON required", 415)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
