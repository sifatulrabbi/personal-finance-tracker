package finance

import "errors"

// Error codes are part of the HTTP API contract; see docs/adr/0008-api-error-envelope.md.
const (
	CodeValidationFailed     = "validation_failed"
	CodeStaleVersion         = "stale_version"
	CodeIdempotencyKeyReused = "idempotency_key_reused"
	CodeArchivedWallet       = "archived_wallet"
	CodeRateRequired         = "rate_required"
	CodeDuplicateName        = "duplicate_name"
	CodeAlreadySettled       = "already_settled"
	CodeNotCorrectable       = "not_correctable"
	CodeNotFound             = "not_found"
	CodeUnauthenticated      = "unauthenticated"
)

// Error is a domain failure a client can act on. Message is fixed, human-readable text that never
// echoes request values; Field names the single input at fault, when there is one.
type Error struct {
	Code    string
	Message string
	Field   string
}

func (e *Error) Error() string { return e.Message }

// Is matches another *Error by code, so errors.Is(err, ErrStaleVersion) ignores Message and Field.
// It also matches the broad classes ErrInvalid (the request itself must change) and ErrConflict
// (the stored state or request key conflicts with the request).
func (e *Error) Is(target error) bool {
	if t, ok := target.(*Error); ok {
		return t.Code == e.Code
	}
	switch target {
	case ErrInvalid:
		return e.Code == CodeValidationFailed || e.Code == CodeArchivedWallet || e.Code == CodeRateRequired || e.Code == CodeNotCorrectable
	case ErrConflict:
		return e.Code == CodeStaleVersion || e.Code == CodeIdempotencyKeyReused || e.Code == CodeDuplicateName || e.Code == CodeAlreadySettled
	}
	return false
}

// ErrInvalid and ErrConflict are classes. Returned bare, they map to validation_failed and
// stale_version with generic messages; prefer a specific *Error.
var ErrInvalid = errors.New("invalid input")
var ErrConflict = errors.New("conflicting change")

var (
	ErrNotFound             = &Error{Code: CodeNotFound, Message: "Record not found."}
	ErrUnauthorized         = &Error{Code: CodeUnauthenticated, Message: "Sign in to continue."}
	ErrStaleVersion         = &Error{Code: CodeStaleVersion, Message: "This record changed since it was loaded. Reload it and try again.", Field: "version"}
	ErrIdempotencyKeyReused = &Error{Code: CodeIdempotencyKeyReused, Message: "This Idempotency-Key was already used for a different request. Send a new key."}
	ErrRateRequired         = &Error{Code: CodeRateRequired, Message: "Enter a BDT per USD rate or set a default rate in Settings.", Field: "rate"}
	ErrArchivedWallet       = &Error{Code: CodeArchivedWallet, Message: "This wallet is archived."}
	ErrAlreadySettled       = &Error{Code: CodeAlreadySettled, Message: "This bill was already paid or skipped."}
	ErrNotCorrectable       = &Error{Code: CodeNotCorrectable, Message: "Opening balances and adjustments cannot be corrected or voided. Record a new balance adjustment instead."}
	ErrDuplicateName        = &Error{Code: CodeDuplicateName, Message: "A category with this name and type already exists.", Field: "name"}
)

func invalid(field, message string) error {
	return &Error{Code: CodeValidationFailed, Message: message, Field: field}
}
func archived(field, message string) error {
	return &Error{Code: CodeArchivedWallet, Message: message, Field: field}
}

// walletNotFound names the input field that referenced a missing wallet; other errors pass through.
func walletNotFound(field string, e error) error {
	if errors.Is(e, ErrNotFound) {
		return &Error{Code: CodeNotFound, Message: "Wallet not found.", Field: field}
	}
	return e
}
