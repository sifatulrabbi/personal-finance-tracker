package httpapi

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"simply-finance/internal/ledger"
	"testing"
)

// Regression: respond mapped sql.ErrNoRows to 404, so a lookup bug looked like a missing record.
// Only typed not-found errors become 404; everything untyped is 500 internal.
func TestWriteErrorOnlyTrustsTypedErrors(t *testing.T) {
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{sql.ErrNoRows, 500, "internal"},
		{fmt.Errorf("scan: %w", sql.ErrNoRows), 500, "internal"},
		{errors.New("disk I/O error"), 500, "internal"},
		{ledger.ErrNotFound, 404, "not_found"},
		{fmt.Errorf("load: %w", ledger.ErrNotFound), 404, "not_found"},
		{ledger.ErrInvalid, 400, "validation_failed"},
		{ledger.ErrConflict, 409, "stale_version"},
		{&ledger.Error{Code: "unlisted_code", Message: "x"}, 500, "internal"},
	} {
		w := httptest.NewRecorder()
		writeError(w, tc.err)
		var body struct {
			Error errorDetail `json:"error"`
		}
		if e := json.Unmarshal(w.Body.Bytes(), &body); e != nil || w.Code != tc.status || body.Error.Code != tc.code {
			t.Errorf("%v: %d %s %v", tc.err, w.Code, w.Body, e)
		}
	}
}

// Every code a client can receive has a status; a new code without one would silently become 500.
func TestEveryDocumentedCodeHasAStatus(t *testing.T) {
	for _, code := range []string{"validation_failed", "stale_version", "idempotency_key_reused", "archived_wallet", "rate_required", "duplicate_name", "already_settled", "not_correctable", "not_found", "unauthenticated", "forbidden", "unsupported_media_type", "method_not_allowed", "rate_limited", "internal"} {
		if _, ok := statusByCode[code]; !ok {
			t.Errorf("no status for %s", code)
		}
	}
	if len(statusByCode) != 15 {
		t.Errorf("statusByCode has %d codes; update the documented list", len(statusByCode))
	}
}
