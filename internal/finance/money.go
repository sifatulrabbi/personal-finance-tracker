package finance

import (
	"errors"
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

const MaxMoney int64 = 9_000_000_000_000
const RateScale int64 = 1_000_000

var ErrInvalid = errors.New("invalid input")
var ErrConflict = errors.New("record changed or request key reused")
var ErrNotFound = errors.New("record not found")
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
func ParseMoney(s string) (int64, error) { return parseDecimal(s, 2, MaxMoney) }
func ParseRate(s string) (int64, error) {
	n, e := parseDecimal(s, 6, 1_000_000*RateScale)
	if e != nil || n <= 0 {
		return 0, ErrInvalid
	}
	return n, nil
}
func FormatMoney(n int64) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	return sign + strconv.FormatInt(n/100, 10) + "." + leftPad(strconv.FormatInt(n%100, 10), 2)
}
func FormatRate(n int64) string {
	return strconv.FormatInt(n/RateScale, 10) + "." + leftPad(strconv.FormatInt(n%RateScale, 10), 6)
}
func leftPad(s string, n int) string { return strings.Repeat("0", n-len(s)) + s }
func Convert(minor, rate int64, from string) (int64, error) {
	if minor < -MaxMoney || minor > MaxMoney || rate <= 0 || rate > 1_000_000*RateScale {
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
