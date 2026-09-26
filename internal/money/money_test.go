package money_test

import (
	"errors"
	"math/big"
	"simply-finance/internal/money"
	"testing"
)

func TestMoneyUsesExactMinorUnits(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  int64
	}{{"0.01", 1}, {"123.45", 12345}, {"100", 10000}, {"-12.50", -1250}} {
		got, err := money.ParseMoney(tc.input)
		if err != nil || got != tc.want {
			t.Fatalf("%s: %d, %v", tc.input, got, err)
		}
	}
	for _, bad := range []string{"", "1.001", "NaN", "1e3", " 1", "9999999999999999999999"} {
		if _, err := money.ParseMoney(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
	rate, err := money.ParseRate("122.123456")
	if err != nil {
		t.Fatal(err)
	}
	got, err := money.Convert(100, rate, "USD")
	if err != nil || got != 12212 {
		t.Fatalf("conversion: %d %v", got, err)
	}
	got, err = money.Convert(12212, rate, "BDT")
	if err != nil || got != 100 {
		t.Fatalf("reverse conversion: %d %v", got, err)
	}
	if _, err := money.ParseRate("0"); err == nil {
		t.Fatal("accepted zero rate")
	}
	if _, err := money.Convert(money.MaxMoney, rate, "USD"); err == nil {
		t.Fatal("accepted overflowing converted amount")
	}
}

func TestFormatHundredthsHandlesSignsAndTotalsBeyondInt64(t *testing.T) {
	huge, _ := new(big.Int).SetString("123456789012345678901", 10)
	for _, tc := range []struct {
		n    *big.Int
		want string
	}{
		{big.NewInt(0), "0.00"},
		{big.NewInt(5), "0.05"},
		{big.NewInt(-5), "-0.05"},
		{big.NewInt(-12345), "-123.45"},
		{huge, "1234567890123456789.01"},
	} {
		if got := money.FormatHundredths(tc.n); got != tc.want {
			t.Errorf("%s: %s, want %s", tc.n, got, tc.want)
		}
	}
}

func TestConvertRoundsHalfUpInMagnitude(t *testing.T) {
	for _, tc := range []struct {
		minor, rate int64
		from        string
		want        int64
	}{
		{1, 500_000, "USD", 1},   // half a minor unit rounds up
		{-1, 500_000, "USD", -1}, // and symmetrically for a negative amount
		{1, 400_000, "USD", 0},
		{100, 120_000_000, "USD", 12000},
		{12000, 120_000_000, "BDT", 100},
	} {
		got, err := money.Convert(tc.minor, tc.rate, tc.from)
		if err != nil || got != tc.want {
			t.Errorf("%+v: %d %v", tc, got, err)
		}
	}
	for _, bad := range []struct {
		minor, rate int64
		from        string
	}{{1, 0, "USD"}, {1, 1, "EUR"}, {money.MaxMoney + 1, 1, "USD"}, {1, 1_000_000*money.RateScale + 1, "USD"}} {
		if _, err := money.Convert(bad.minor, bad.rate, bad.from); !errors.Is(err, money.ErrInvalid) {
			t.Errorf("%+v: %v", bad, err)
		}
	}
}

func TestFormatRateAndMustMoney(t *testing.T) {
	if got := money.FormatRate(122_123_456); got != "122.123456" {
		t.Fatal(got)
	}
	if money.MustMoney("12.30") != 1230 || money.MustMoney("not money") != 0 {
		t.Fatal("MustMoney")
	}
}
