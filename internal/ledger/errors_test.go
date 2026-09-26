package ledger_test

import (
	"errors"
	"fmt"
	"simply-finance/internal/ledger"
	"testing"
)

func TestDomainErrorsMatchByCodeAndClass(t *testing.T) {
	stale := &ledger.Error{Code: ledger.CodeStaleVersion, Message: "other text", Field: "x"}
	if !errors.Is(fmt.Errorf("wrapped: %w", stale), ledger.ErrStaleVersion) {
		t.Fatal("same code must match regardless of message and field")
	}
	if errors.Is(stale, ledger.ErrIdempotencyKeyReused) {
		t.Fatal("stale version and key reuse must stay distinguishable")
	}
	for _, tc := range []struct {
		err               error
		invalid, conflict bool
	}{
		{ledger.ErrRateRequired, true, false},
		{ledger.ErrArchivedWallet, true, false},
		{ledger.ErrNotCorrectable, true, false},
		{&ledger.Error{Code: ledger.CodeValidationFailed}, true, false},
		{ledger.ErrStaleVersion, false, true},
		{ledger.ErrIdempotencyKeyReused, false, true},
		{ledger.ErrDuplicateName, false, true},
		{ledger.ErrAlreadySettled, false, true},
		{ledger.ErrNotFound, false, false},
		{ledger.ErrUnauthorized, false, false},
	} {
		if errors.Is(tc.err, ledger.ErrInvalid) != tc.invalid || errors.Is(tc.err, ledger.ErrConflict) != tc.conflict {
			t.Errorf("%v: invalid=%v conflict=%v", tc.err, errors.Is(tc.err, ledger.ErrInvalid), errors.Is(tc.err, ledger.ErrConflict))
		}
	}
}
