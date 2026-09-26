// Package money parses, formats, and converts amounts and exchange rates without floating point.
// Amounts are integer minor units (hundredths); rates are BDT per USD scaled by RateScale.
package money

import (
	"errors"
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

// MaxMoney is the largest amount, in minor units, a record or balance may hold.
const MaxMoney int64 = 9_000_000_000_000

// RateScale is the fixed precision of a rate: six decimal places.
const RateScale int64 = 1_000_000

// maxRate is the largest accepted rate, one million BDT per USD.
const maxRate = 1_000_000 * RateScale

// ErrInvalid reports input that is not a valid amount, rate, or conversion. The ledger package's
// ErrInvalid is this same value, so a money failure is an "invalid input" failure everywhere.
var ErrInvalid = errors.New("invalid input")

var decimal = regexp.MustCompile(`^-?[0-9]+(?:\.[0-9]+)?$`)

func parseDecimal(s string, places int, limit int64) (int64, error) {
	if !decimal.MatchString(s) {
		return 0, ErrInvalid
	}
	negative := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	parts := strings.Split(s, ".")
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > places {
		return 0, ErrInvalid
	}
	raw := strings.TrimLeft(parts[0]+fraction+strings.Repeat("0", places-len(fraction)), "0")
	if raw == "" {
		raw = "0"
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n > limit {
		return 0, ErrInvalid
	}
	if negative {
		n = -n
	}
	return n, nil
}

// ParseMoney reads a decimal string with at most two decimal places as minor units.
func ParseMoney(s string) (int64, error) { return parseDecimal(s, 2, MaxMoney) }

// MustMoney parses an amount that was already validated or formatted by this package; an invalid
// one reads as zero.
func MustMoney(s string) int64 { n, _ := ParseMoney(s); return n }

// ParseRate reads a positive rate with at most six decimal places.
func ParseRate(s string) (int64, error) {
	n, err := parseDecimal(s, 6, maxRate)
	if err != nil || n <= 0 {
		return 0, ErrInvalid
	}
	return n, nil
}

// FormatMoney writes minor units as a decimal string with two places.
func FormatMoney(n int64) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	return sign + strconv.FormatInt(n/100, 10) + "." + leftPad(strconv.FormatInt(n%100, 10), 2)
}

// FormatRate writes a scaled rate as a decimal string with six places.
func FormatRate(n int64) string {
	return strconv.FormatInt(n/RateScale, 10) + "." + leftPad(strconv.FormatInt(n%RateScale, 10), 6)
}

// FormatHundredths writes an arbitrary-precision count of hundredths, such as a sum of minor units
// or a percentage in hundredths, as a decimal string. Totals across many records may exceed int64.
func FormatHundredths(n *big.Int) string {
	sign := ""
	if n.Sign() < 0 {
		sign = "-"
	}
	whole, fraction := new(big.Int), new(big.Int)
	whole.QuoRem(new(big.Int).Abs(n), big.NewInt(100), fraction)
	return sign + whole.String() + "." + leftPad(fraction.String(), 2)
}

func leftPad(s string, n int) string { return strings.Repeat("0", n-len(s)) + s }

// Convert converts minor units from one currency to the other at a BDT-per-USD rate, rounding half
// up in magnitude. from is the amount's currency, "USD" or "BDT".
func Convert(minor, rate int64, from string) (int64, error) {
	if minor < -MaxMoney || minor > MaxMoney || rate <= 0 || rate > maxRate {
		return 0, ErrInvalid
	}
	numerator, denominator := rate, RateScale
	if from == "BDT" {
		numerator, denominator = RateScale, rate
	} else if from != "USD" {
		return 0, ErrInvalid
	}
	negative := minor < 0
	if negative {
		minor = -minor
	}
	n := new(big.Int).Mul(big.NewInt(minor), big.NewInt(numerator))
	n.Add(n, big.NewInt(denominator/2))
	n.Quo(n, big.NewInt(denominator))
	if !n.IsInt64() || n.Int64() > MaxMoney {
		return 0, ErrInvalid
	}
	result := n.Int64()
	if negative {
		result = -result
	}
	return result, nil
}
