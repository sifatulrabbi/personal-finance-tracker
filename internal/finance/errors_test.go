package finance_test

import (
	"errors"
	"fmt"
	"simply-finance/internal/finance"
	"testing"
)

func TestDomainErrorsMatchByCodeAndClass(t *testing.T) {
	stale := &finance.Error{Code: finance.CodeStaleVersion, Message: "other text", Field: "x"}
	if !errors.Is(fmt.Errorf("wrapped: %w", stale), finance.ErrStaleVersion) {
		t.Fatal("same code must match regardless of message and field")
	}
	if errors.Is(stale, finance.ErrIdempotencyKeyReused) {
		t.Fatal("stale version and key reuse must stay distinguishable")
	}
	for _, tc := range []struct {
		err               error
		invalid, conflict bool
	}{
		{finance.ErrRateRequired, true, false},
		{finance.ErrArchivedWallet, true, false},
		{finance.ErrNotCorrectable, true, false},
		{&finance.Error{Code: finance.CodeValidationFailed}, true, false},
		{finance.ErrStaleVersion, false, true},
		{finance.ErrIdempotencyKeyReused, false, true},
		{finance.ErrDuplicateName, false, true},
		{finance.ErrAlreadySettled, false, true},
		{finance.ErrNotFound, false, false},
		{finance.ErrUnauthorized, false, false},
	} {
		if errors.Is(tc.err, finance.ErrInvalid) != tc.invalid || errors.Is(tc.err, finance.ErrConflict) != tc.conflict {
			t.Errorf("%v: invalid=%v conflict=%v", tc.err, errors.Is(tc.err, finance.ErrInvalid), errors.Is(tc.err, finance.ErrConflict))
		}
	}
}
