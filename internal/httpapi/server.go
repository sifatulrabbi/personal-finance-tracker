package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/netip"
	"net/url"
	"simply-finance/internal/app"
	"simply-finance/internal/ledger"
	"simply-finance/internal/sqlite"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
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
	// TrustedProxies are the reverse proxies whose X-Forwarded-For header names the client for
	// login throttling. Empty means the connecting address is the client.
	TrustedProxies []netip.Prefix
	// Logger receives the access log; nil uses slog.Default().
	Logger *slog.Logger
}
type Server struct {
	app     *app.Service
	store   *sqlite.Store
	config  Config
	users   map[string]Credential
	dummy   []byte
	compare func(hash, password []byte) error
	limiter *loginLimiter
	logger  *slog.Logger
}
type actorKey struct{}

func New(svc *app.Service, store *sqlite.Store, config Config) (http.Handler, error) {
	s, e := newServer(svc, store, config)
	if e != nil {
		return nil, e
	}
	return s.handler(), nil
}
func newServer(svc *app.Service, store *sqlite.Store, config Config) (*Server, error) {
	if config.Now == nil {
		config.Now = time.Now
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
	s := &Server{app: svc, store: store, config: config, users: map[string]Credential{}, compare: bcrypt.CompareHashAndPassword, logger: config.Logger}
	if len(config.Users) == 0 || len(config.Users) > 100 {
		return nil, ledger.ErrInvalid
	}
	dummyCost := bcrypt.MinCost
	for _, u := range config.Users {
		email, e := ledger.NormalizeEmail(u.Email)
		if e != nil || len(u.Name) > 120 {
			return nil, ledger.ErrInvalid
		}
		if _, exists := s.users[email]; exists {
			return nil, ledger.ErrInvalid
		}
		cost, e := bcrypt.Cost([]byte(u.PasswordHash))
		if e != nil || cost < 10 || cost > 14 {
			return nil, ledger.ErrInvalid
		}
		dummyCost = max(dummyCost, cost)
		u.Email = email
		s.users[email] = u
	}
	allowed := map[string]string{}
	emails := []string{}
	for email, u := range s.users {
		allowed[email] = digest(u.PasswordHash)
		emails = append(emails, email)
	}
	s.limiter = newLoginLimiter(config.Now, config.TrustedProxies, emails)
	if e = store.ReconcileSessions(context.Background(), allowed); e != nil {
		return nil, e
	}
	// Unknown emails are checked against a dummy hash at the slowest configured cost, so a wrong
	// password takes at least as long for an unknown email as for an allowed one.
	s.dummy, e = bcrypt.GenerateFromPassword([]byte("unconfigured-account-dummy"), dummyCost)
	if e != nil {
		return nil, e
	}
	return s, nil
}
func (s *Server) handler() http.Handler {
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
	private.HandleFunc("GET /api/v1/summary", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.app.Summary(r.Context())
		respond(w, v, e)
	})
	private.HandleFunc("GET /api/v1/categories", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.app.Categories(r.Context())
		respond(w, v, e)
	})
	private.HandleFunc("POST /api/v1/categories", input(func(r *http.Request, in ledger.CategoryInput) (any, error) {
		return s.app.CreateCategory(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("GET /api/v1/monthly", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.app.Monthly(r.Context(), r.URL.Query().Get("month"))
		respond(w, v, e)
	})
	private.HandleFunc("PUT /api/v1/monthly/{month}/target", input(func(r *http.Request, in struct {
		Amount  string `json:"amount"`
		Version int    `json:"version"`
	}) (any, error) {
		return s.app.SetMonthlyTarget(r.Context(), actor(r).ID, key(r), r.PathValue("month"), in.Amount, in.Version)
	}))
	private.HandleFunc("GET /api/v1/wallets", func(w http.ResponseWriter, r *http.Request) { v, e := s.app.Wallets(r.Context()); respond(w, v, e) })
	private.HandleFunc("GET /api/v1/wallets/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.app.Wallet(r.Context(), r.PathValue("id"))
		respond(w, v, e)
	})
	private.HandleFunc("POST /api/v1/wallets", input(func(r *http.Request, in ledger.WalletInput) (any, error) {
		return s.app.CreateWallet(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("PUT /api/v1/wallets/{id}", input(func(r *http.Request, in ledger.Wallet) (any, error) {
		if in.ID != r.PathValue("id") {
			return nil, errPathID
		}
		return s.app.UpdateWallet(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("POST /api/v1/wallets/{id}/adjust", input(func(r *http.Request, in struct {
		BalanceVersion int    `json:"balance_version"`
		Balance        string `json:"balance"`
		Reason         string `json:"reason"`
	}) (any, error) {
		return s.app.AdjustWallet(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.BalanceVersion, in.Balance, in.Reason)
	}))
	private.HandleFunc("GET /api/v1/transactions", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if cursorPaged(r, "wallet_id", "kind", "category_id", "from", "to", "include_voided") {
			l, e := cursorLimit(r)
			if e != nil {
				respond(w, nil, e)
				return
			}
			f := app.TransactionFilter{WalletID: q.Get("wallet_id"), Kind: q.Get("kind"), CategoryID: q.Get("category_id"), From: q.Get("from"), To: q.Get("to")}
			switch q.Get("include_voided") {
			case "", "false":
			case "true":
				f.IncludeVoided = true
			default:
				respond(w, nil, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use true or false.", Field: "include_voided"})
				return
			}
			v, e := s.app.TransactionsPage(r.Context(), f, q.Get("cursor"), l)
			respond(w, v, e)
			return
		}
		l, o, e := page(r)
		if e != nil {
			respond(w, nil, e)
			return
		}
		v, e := s.app.Transactions(r.Context(), l, o)
		respond(w, v, e)
	})
	private.HandleFunc("POST /api/v1/transactions", input(func(r *http.Request, in ledger.TransactionInput) (any, error) {
		return s.app.CreateTransaction(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("PUT /api/v1/transactions/{id}", input(func(r *http.Request, in struct {
		ledger.TransactionInput
		Version int `json:"version"`
	}) (any, error) {
		return s.app.ReviseTransaction(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Version, in.TransactionInput, false)
	}))
	private.HandleFunc("POST /api/v1/transactions/{id}/void", input(func(r *http.Request, in struct {
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}) (any, error) {
		return s.app.ReviseTransaction(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Version, ledger.TransactionInput{Reason: in.Reason}, true)
	}))
	private.HandleFunc("GET /api/v1/transactions/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.app.Transaction(r.Context(), r.PathValue("id"))
		respond(w, v, e)
	})
	private.HandleFunc("GET /api/v1/transactions/{id}/history", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.app.History(r.Context(), r.PathValue("id"))
		respond(w, v, e)
	})
	private.HandleFunc("GET /api/v1/settings", func(w http.ResponseWriter, r *http.Request) { v, e := s.app.Settings(r.Context()); respond(w, v, e) })
	private.HandleFunc("PUT /api/v1/settings", input(func(r *http.Request, in struct {
		Rate    string `json:"rate"`
		Version int    `json:"version"`
	}) (any, error) {
		return s.app.SetRate(r.Context(), actor(r).ID, key(r), in.Rate, in.Version)
	}))
	private.HandleFunc("GET /api/v1/schedules", func(w http.ResponseWriter, r *http.Request) { v, e := s.app.Schedules(r.Context()); respond(w, v, e) })
	private.HandleFunc("GET /api/v1/schedules/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.app.Schedule(r.Context(), r.PathValue("id"))
		respond(w, v, e)
	})
	private.HandleFunc("POST /api/v1/schedules", input(func(r *http.Request, in ledger.ScheduleInput) (any, error) {
		return s.app.CreateSchedule(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("PUT /api/v1/schedules/{id}", input(func(r *http.Request, in ledger.Schedule) (any, error) {
		if in.ID != r.PathValue("id") {
			return nil, errPathID
		}
		return s.app.UpdateSchedule(r.Context(), actor(r).ID, key(r), in)
	}))
	private.HandleFunc("GET /api/v1/bills", func(w http.ResponseWriter, r *http.Request) {
		l, o, e := page(r)
		if e != nil {
			respond(w, nil, e)
			return
		}
		v, e := s.app.Bills(r.Context(), r.URL.Query().Get("status"), l, o)
		respond(w, v, e)
	})
	private.HandleFunc("GET /api/v1/bills/upcoming", func(w http.ResponseWriter, r *http.Request) {
		days := 30
		if raw := r.URL.Query().Get("days"); raw != "" {
			n, e := strconv.Atoi(raw)
			if e != nil {
				respond(w, nil, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use a whole number of days.", Field: "days"})
				return
			}
			days = n
		}
		v, e := s.app.Upcoming(r.Context(), days)
		respond(w, v, e)
	})
	private.HandleFunc("GET /api/v1/bills/due", func(w http.ResponseWriter, r *http.Request) { v, e := s.app.Due(r.Context()); respond(w, v, e) })
	private.HandleFunc("POST /api/v1/bills/{id}/confirm", input(func(r *http.Request, in ledger.PaymentInput) (any, error) {
		return s.app.ConfirmBill(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in)
	}))
	private.HandleFunc("POST /api/v1/bills/{id}/skip", input(func(r *http.Request, in struct {
		Reason string `json:"reason"`
	}) (any, error) {
		return s.app.SkipBill(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Reason)
	}))
	private.HandleFunc("GET /api/v1/audit", func(w http.ResponseWriter, r *http.Request) {
		if cursorPaged(r) {
			l, e := cursorLimit(r)
			if e != nil {
				respond(w, nil, e)
				return
			}
			v, e := s.app.AuditPage(r.Context(), r.URL.Query().Get("cursor"), l)
			respond(w, v, e)
			return
		}
		l, o, e := page(r)
		if e != nil {
			respond(w, nil, e)
			return
		}
		v, e := s.app.Audit(r.Context(), l, o)
		respond(w, v, e)
	})
	mux.Handle("/api/", s.authenticate(jsonErrors(private)))
	return s.accessLog(s.security(jsonErrors(mux)))
}
func actor(r *http.Request) ledger.User { return r.Context().Value(actorKey{}).(ledger.User) }
func key(r *http.Request) string        { return r.Header.Get("Idempotency-Key") }
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
		return errBodyTooLarge
	}
	if len(strings.TrimSpace(string(b))) == 0 || strings.TrimSpace(string(b))[0] != '{' {
		return errNotOneObject
	}
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.DisallowUnknownFields()
	if e = dec.Decode(out); e != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(e, &typeError) && typeError.Field != "" {
			return &ledger.Error{Code: ledger.CodeValidationFailed, Message: "This field has the wrong JSON type.", Field: typeError.Field}
		}
		return errMalformedBody
	}
	if e = dec.Decode(&struct{}{}); e != io.EOF {
		return errNotOneObject
	}
	return nil
}

var (
	errBodyTooLarge  = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "The request body could not be read or is larger than 32 KB."}
	errNotOneObject  = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Send exactly one JSON object as the request body."}
	errMalformedBody = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "The request body is not valid JSON for this endpoint, or it has an unknown field."}
	errPathID        = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "The id in the body must match the id in the path.", Field: "id"}
)

func respond(w http.ResponseWriter, v any, e error) {
	if e != nil {
		writeError(w, e)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
func page(r *http.Request) (int, int, error) {
	l, o := 100, 0
	var e error
	if r.URL.Query().Get("limit") != "" {
		l, e = strconv.Atoi(r.URL.Query().Get("limit"))
		if e != nil {
			return 0, 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use a whole-number limit.", Field: "limit"}
		}
	}
	if r.URL.Query().Get("offset") != "" {
		o, e = strconv.Atoi(r.URL.Query().Get("offset"))
		if e != nil {
			return 0, 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use a whole-number offset.", Field: "offset"}
		}
	}
	return l, o, nil
}

// cursorPaged reports whether a list request opted into the cursor-paged form, which answers
// {"items":[...],"next_cursor":...}: it sends page=cursor, a cursor, or any of the list's filters.
// Without them the list keeps its original bare-array, offset-paged answer for older clients.
func cursorPaged(r *http.Request, filters ...string) bool {
	q := r.URL.Query()
	for _, name := range append([]string{"page", "cursor"}, filters...) {
		if q.Has(name) {
			return true
		}
	}
	return false
}

// cursorLimit validates a cursor-paged request's page and offset parameters and returns its limit.
func cursorLimit(r *http.Request) (int, error) {
	q := r.URL.Query()
	if q.Has("page") && q.Get("page") != "cursor" {
		return 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use page=cursor, or leave page out.", Field: "page"}
	}
	if q.Has("offset") {
		return 0, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "A cursor-paged list does not take an offset. Send the previous page's next_cursor as cursor.", Field: "offset"}
	}
	l, _, e := page(r)
	return l, e
}
func digest(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func (s *Server) cookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{Name: "sf_session", Value: value, Path: "/", HttpOnly: true, Secure: !s.config.InsecureCookies, SameSite: http.SameSiteStrictMode, MaxAge: maxAge})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if e := decode(w, r, &in); e != nil {
		respond(w, nil, e)
		return
	}
	email, e := ledger.NormalizeEmail(in.Email)
	account := email
	if e != nil {
		account = "invalid email"
	}
	address := s.limiter.clientKey(r)
	if wait := s.limiter.begin(address, account); wait > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(int((wait+time.Second-1)/time.Second)))
		writeError(w, errRateLimited)
		return
	}
	credential, exists := s.users[email]
	hash := s.dummy
	if exists {
		hash = []byte(credential.PasswordHash)
	}
	// bcrypt reads at most 72 bytes; a longer password is compared on its prefix and then refused,
	// so rejecting it costs the same time as any other wrong password.
	password := []byte(in.Password)
	tooLong := len(password) > 72
	if tooLong {
		password = password[:72]
	}
	e = s.compare(hash, password)
	if e != nil || !exists || tooLong {
		writeError(w, errLoginFailed)
		return
	}
	s.limiter.succeeded(address, account)
	user, e := s.store.EnsureUser(r.Context(), email, credential.Name)
	if e != nil {
		respond(w, nil, e)
		return
	}
	if a := entry(r); a != nil {
		a.actorID = user.ID
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
	now := s.config.Now()
	if e = s.store.SaveSession(r.Context(), digest(token), user.ID, digest(credential.PasswordHash), now.Add(7*24*time.Hour), now); e != nil {
		respond(w, nil, e)
		return
	}
	s.cookie(w, token, 7*24*3600)
	respond(w, user, nil)
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
			respond(w, nil, ledger.ErrUnauthorized)
			return
		}
		u, hash, e := s.store.Session(r.Context(), digest(c.Value), s.config.Now())
		if e != nil {
			respond(w, nil, e)
			return
		}
		credential, ok := s.users[u.Email]
		if !ok || digest(credential.PasswordHash) != hash {
			respond(w, nil, ledger.ErrUnauthorized)
			return
		}
		if a := entry(r); a != nil {
			a.actorID = u.ID
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
				writeError(w, errForbidden)
				return
			}
			if e != nil || media != "application/json" {
				writeError(w, errMediaType)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
