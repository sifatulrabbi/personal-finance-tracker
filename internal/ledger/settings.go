package ledger

import (
	"net/mail"
	"strings"

	"simply-finance/internal/money"
)

// ParseRateChange checks a default-rate change against the settings the writer read.
func ParseRateChange(old Settings, version int, rate string) (int64, error) {
	if old.Version != version {
		return 0, ErrStaleVersion
	}
	n, err := money.ParseRate(rate)
	if err != nil {
		return 0, Invalid("rate", "Enter a positive rate with at most six decimal places.")
	}
	return n, nil
}

// ValidateCategory checks a new category. Names are kept exactly as entered (ADR 0005).
func ValidateCategory(in CategoryInput) error {
	if in.Type != "income" && in.Type != "expense" {
		return Invalid("type", "Choose income or expense.")
	}
	if strings.TrimSpace(in.Name) == "" || len(in.Name) > 120 {
		return Invalid("name", "Enter a name of at most 120 bytes.")
	}
	return nil
}

// NormalizeEmail lowercases and trims an email address and accepts only a bare address.
func NormalizeEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	a, err := mail.ParseAddress(email)
	if err != nil || a.Address != email || len(email) > 254 {
		return "", ErrInvalid
	}
	return email, nil
}

// Profile checks a user profile's email and display name; an empty name is the email.
func Profile(email, name string) (string, string, error) {
	email, err := NormalizeEmail(email)
	if err != nil {
		return "", "", err
	}
	if name == "" {
		name = email
	}
	if len(name) > 120 {
		return "", "", ErrInvalid
	}
	return email, name, nil
}
