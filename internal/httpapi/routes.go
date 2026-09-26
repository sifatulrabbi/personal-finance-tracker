package httpapi

import (
	"net/http"
	"strconv"

	"simply-finance/internal/app"
	"simply-finance/internal/ledger"
)

// routes registers every authenticated endpoint. Handlers only decode the request, name the acting
// user and request key, and call one use case; docs/api.md describes each endpoint.
func (s *Server) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/me", func(w http.ResponseWriter, r *http.Request) { respond(w, actor(r), nil) })
	mux.HandleFunc("POST /api/v1/logout", s.logout)
	s.walletRoutes(mux)
	s.transactionRoutes(mux)
	s.householdRoutes(mux)
	s.billRoutes(mux)
}

func (s *Server) walletRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/wallets", query(func(r *http.Request) (any, error) { return s.app.Wallets(r.Context()) }))
	mux.HandleFunc("GET /api/v1/wallets/{id}", query(func(r *http.Request) (any, error) { return s.app.Wallet(r.Context(), r.PathValue("id")) }))
	mux.HandleFunc("POST /api/v1/wallets", input(func(r *http.Request, in ledger.WalletInput) (any, error) {
		return s.app.CreateWallet(r.Context(), actor(r).ID, key(r), in)
	}))
	mux.HandleFunc("PUT /api/v1/wallets/{id}", input(func(r *http.Request, in ledger.Wallet) (any, error) {
		if in.ID != r.PathValue("id") {
			return nil, errPathID
		}
		return s.app.UpdateWallet(r.Context(), actor(r).ID, key(r), in)
	}))
	mux.HandleFunc("POST /api/v1/wallets/{id}/adjust", input(func(r *http.Request, in struct {
		BalanceVersion int    `json:"balance_version"`
		Balance        string `json:"balance"`
		Reason         string `json:"reason"`
	}) (any, error) {
		return s.app.AdjustWallet(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.BalanceVersion, in.Balance, in.Reason)
	}))
}

func (s *Server) transactionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/transactions", query(s.listTransactions))
	mux.HandleFunc("POST /api/v1/transactions", input(func(r *http.Request, in ledger.TransactionInput) (any, error) {
		return s.app.CreateTransaction(r.Context(), actor(r).ID, key(r), in)
	}))
	mux.HandleFunc("GET /api/v1/transactions/{id}", query(func(r *http.Request) (any, error) { return s.app.Transaction(r.Context(), r.PathValue("id")) }))
	mux.HandleFunc("GET /api/v1/transactions/{id}/history", query(func(r *http.Request) (any, error) { return s.app.History(r.Context(), r.PathValue("id")) }))
	mux.HandleFunc("PUT /api/v1/transactions/{id}", input(func(r *http.Request, in struct {
		ledger.TransactionInput
		Version int `json:"version"`
	}) (any, error) {
		return s.app.ReviseTransaction(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Version, in.TransactionInput, false)
	}))
	mux.HandleFunc("POST /api/v1/transactions/{id}/void", input(func(r *http.Request, in struct {
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}) (any, error) {
		return s.app.ReviseTransaction(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Version, ledger.TransactionInput{Reason: in.Reason}, true)
	}))
}

// householdRoutes are the shared settings, categories, monthly spending, home summary, and change
// log.
func (s *Server) householdRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/summary", query(func(r *http.Request) (any, error) { return s.app.Summary(r.Context()) }))
	mux.HandleFunc("GET /api/v1/settings", query(func(r *http.Request) (any, error) { return s.app.Settings(r.Context()) }))
	mux.HandleFunc("PUT /api/v1/settings", input(func(r *http.Request, in struct {
		Rate    string `json:"rate"`
		Version int    `json:"version"`
	}) (any, error) {
		return s.app.SetRate(r.Context(), actor(r).ID, key(r), in.Rate, in.Version)
	}))
	mux.HandleFunc("GET /api/v1/categories", query(func(r *http.Request) (any, error) { return s.app.Categories(r.Context()) }))
	mux.HandleFunc("POST /api/v1/categories", input(func(r *http.Request, in ledger.CategoryInput) (any, error) {
		return s.app.CreateCategory(r.Context(), actor(r).ID, key(r), in)
	}))
	mux.HandleFunc("GET /api/v1/monthly", query(func(r *http.Request) (any, error) { return s.app.Monthly(r.Context(), r.URL.Query().Get("month")) }))
	mux.HandleFunc("PUT /api/v1/monthly/{month}/target", input(func(r *http.Request, in struct {
		Amount  string `json:"amount"`
		Version int    `json:"version"`
	}) (any, error) {
		return s.app.SetMonthlyTarget(r.Context(), actor(r).ID, key(r), r.PathValue("month"), in.Amount, in.Version)
	}))
	mux.HandleFunc("GET /api/v1/audit", query(s.listAudit))
}

// billRoutes are the recurring schedules and their occurrences.
func (s *Server) billRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/schedules", query(func(r *http.Request) (any, error) { return s.app.Schedules(r.Context()) }))
	mux.HandleFunc("GET /api/v1/schedules/{id}", query(func(r *http.Request) (any, error) { return s.app.Schedule(r.Context(), r.PathValue("id")) }))
	mux.HandleFunc("POST /api/v1/schedules", input(func(r *http.Request, in ledger.ScheduleInput) (any, error) {
		return s.app.CreateSchedule(r.Context(), actor(r).ID, key(r), in)
	}))
	mux.HandleFunc("PUT /api/v1/schedules/{id}", input(func(r *http.Request, in ledger.Schedule) (any, error) {
		if in.ID != r.PathValue("id") {
			return nil, errPathID
		}
		return s.app.UpdateSchedule(r.Context(), actor(r).ID, key(r), in)
	}))
	mux.HandleFunc("GET /api/v1/bills", query(func(r *http.Request) (any, error) {
		l, o, e := page(r)
		if e != nil {
			return nil, e
		}
		return s.app.Bills(r.Context(), r.URL.Query().Get("status"), l, o)
	}))
	mux.HandleFunc("GET /api/v1/bills/upcoming", query(func(r *http.Request) (any, error) {
		days := 30
		if raw := r.URL.Query().Get("days"); raw != "" {
			n, e := strconv.Atoi(raw)
			if e != nil {
				return nil, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use a whole number of days.", Field: "days"}
			}
			days = n
		}
		return s.app.Upcoming(r.Context(), days)
	}))
	mux.HandleFunc("GET /api/v1/bills/due", query(func(r *http.Request) (any, error) { return s.app.Due(r.Context()) }))
	mux.HandleFunc("POST /api/v1/bills/{id}/confirm", input(func(r *http.Request, in ledger.PaymentInput) (any, error) {
		return s.app.ConfirmBill(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in)
	}))
	mux.HandleFunc("POST /api/v1/bills/{id}/skip", input(func(r *http.Request, in struct {
		Reason string `json:"reason"`
	}) (any, error) {
		return s.app.SkipBill(r.Context(), actor(r).ID, key(r), r.PathValue("id"), in.Reason)
	}))
}

// listTransactions answers the cursor-paged, filtered list when the request opts in, and the
// deprecated bare-array offset list otherwise (see cursorPaged).
func (s *Server) listTransactions(r *http.Request) (any, error) {
	q := r.URL.Query()
	if !cursorPaged(r, "wallet_id", "kind", "category_id", "from", "to", "include_voided") {
		l, o, e := page(r)
		if e != nil {
			return nil, e
		}
		return s.app.Transactions(r.Context(), l, o)
	}
	l, e := cursorLimit(r)
	if e != nil {
		return nil, e
	}
	f := app.TransactionFilter{WalletID: q.Get("wallet_id"), Kind: q.Get("kind"), CategoryID: q.Get("category_id"), From: q.Get("from"), To: q.Get("to")}
	switch q.Get("include_voided") {
	case "", "false":
	case "true":
		f.IncludeVoided = true
	default:
		return nil, &ledger.Error{Code: ledger.CodeValidationFailed, Message: "Use true or false.", Field: "include_voided"}
	}
	return s.app.TransactionsPage(r.Context(), f, q.Get("cursor"), l)
}

// listAudit answers the cursor-paged change log when the request opts in, and the deprecated
// offset list otherwise.
func (s *Server) listAudit(r *http.Request) (any, error) {
	if cursorPaged(r) {
		l, e := cursorLimit(r)
		if e != nil {
			return nil, e
		}
		return s.app.AuditPage(r.Context(), r.URL.Query().Get("cursor"), l)
	}
	l, o, e := page(r)
	if e != nil {
		return nil, e
	}
	return s.app.Audit(r.Context(), l, o)
}
