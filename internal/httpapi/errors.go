package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"simply-finance/internal/ledger"
	"strings"
)

// Transport-level codes; domain codes live in the ledger package. See docs/adr/0008-api-error-envelope.md.
const (
	codeForbidden            = "forbidden"
	codeUnsupportedMediaType = "unsupported_media_type"
	codeMethodNotAllowed     = "method_not_allowed"
	codeRateLimited          = "rate_limited"
	codeInternal             = "internal"
)

var statusByCode = map[string]int{
	ledger.CodeValidationFailed:     http.StatusBadRequest,
	ledger.CodeArchivedWallet:       http.StatusBadRequest,
	ledger.CodeRateRequired:         http.StatusBadRequest,
	ledger.CodeNotCorrectable:       http.StatusBadRequest,
	ledger.CodeUnauthenticated:      http.StatusUnauthorized,
	codeForbidden:                   http.StatusForbidden,
	ledger.CodeNotFound:             http.StatusNotFound,
	codeMethodNotAllowed:            http.StatusMethodNotAllowed,
	ledger.CodeStaleVersion:         http.StatusConflict,
	ledger.CodeIdempotencyKeyReused: http.StatusConflict,
	ledger.CodeDuplicateName:        http.StatusConflict,
	ledger.CodeAlreadySettled:       http.StatusConflict,
	codeUnsupportedMediaType:        http.StatusUnsupportedMediaType,
	codeRateLimited:                 http.StatusTooManyRequests,
	codeInternal:                    http.StatusInternalServerError,
}

var (
	errInvalidRequest   = &ledger.Error{Code: ledger.CodeValidationFailed, Message: "The request is invalid."}
	errLoginFailed      = &ledger.Error{Code: ledger.CodeUnauthenticated, Message: "The email or password is incorrect."}
	errForbidden        = &ledger.Error{Code: codeForbidden, Message: "Request origin rejected. Send X-CSRF-Protection: 1 from the app's origin."}
	errMediaType        = &ledger.Error{Code: codeUnsupportedMediaType, Message: "Send the request body as application/json."}
	errRouteNotFound    = &ledger.Error{Code: ledger.CodeNotFound, Message: "No API endpoint matches this path."}
	errMethodNotAllowed = &ledger.Error{Code: codeMethodNotAllowed, Message: "This endpoint does not accept this method."}
	errRateLimited      = &ledger.Error{Code: codeRateLimited, Message: "Too many sign-in attempts. Wait for the time in the Retry-After header, then try again."}
	errInternal         = &ledger.Error{Code: codeInternal, Message: "Something went wrong on the server. Try again."}
)

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// writeError is the only place an error becomes a response. Only typed errors reach the client;
// anything else, including a bare sql.ErrNoRows, is an unexpected fault and becomes 500 internal,
// so a lookup bug is never disguised as "not found".
func writeError(w http.ResponseWriter, e error) {
	var fe *ledger.Error
	switch {
	case errors.As(e, &fe):
	case errors.Is(e, ledger.ErrInvalid):
		fe = errInvalidRequest
	case errors.Is(e, ledger.ErrConflict):
		fe = ledger.ErrStaleVersion
	default:
		slog.Error("request failed", "error_type", strings.SplitN(e.Error(), ":", 2)[0])
		fe = errInternal
	}
	status, ok := statusByCode[fe.Code]
	if !ok {
		slog.Error("request failed", "error_type", "unmapped_code")
		fe, status = errInternal, http.StatusInternalServerError
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(struct {
		Error errorDetail `json:"error"`
	}{errorDetail{fe.Code, fe.Message, fe.Field}})
}

// jsonErrors answers the mux's own 404 and 405 with the error envelope, keeping its Allow header.
func jsonErrors(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallback, pattern := mux.Handler(r)
		if a := entry(r); a != nil && pattern != "" {
			a.route = pattern
		}
		if pattern != "" {
			mux.ServeHTTP(w, r)
			return
		}
		probe := &statusProbe{header: http.Header{}}
		fallback.ServeHTTP(probe, r)
		if probe.status == http.StatusMethodNotAllowed {
			w.Header().Set("Allow", probe.header.Get("Allow"))
			writeError(w, errMethodNotAllowed)
			return
		}
		writeError(w, errRouteNotFound)
	})
}

type statusProbe struct {
	header http.Header
	status int
}

func (p *statusProbe) Header() http.Header         { return p.header }
func (p *statusProbe) Write(b []byte) (int, error) { return len(b), nil }
func (p *statusProbe) WriteHeader(status int) {
	if p.status == 0 {
		p.status = status
	}
}
