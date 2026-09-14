package finance_test

import (
	"simply-finance/internal/finance"
	"testing"
)

func TestMoneyUsesExactMinorUnits(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  int64
	}{{"0.01", 1}, {"123.45", 12345}, {"100", 10000}, {"-12.50", -1250}} {
		got, err := finance.ParseMoney(tc.input)
		if err != nil || got != tc.want {
			t.Fatalf("%s: %d, %v", tc.input, got, err)
		}
	}
	for _, bad := range []string{"", "1.001", "NaN", "1e3", " 1", "9999999999999999999999"} {
		if _, err := finance.ParseMoney(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
	rate, err := finance.ParseRate("122.123456")
	if err != nil {
		t.Fatal(err)
	}
	got, err := finance.Convert(100, rate, "USD")
	if err != nil || got != 12212 {
		t.Fatalf("conversion: %d %v", got, err)
	}
	got, err = finance.Convert(12212, rate, "BDT")
	if err != nil || got != 100 {
		t.Fatalf("reverse conversion: %d %v", got, err)
	}
	if _, err := finance.ParseRate("0"); err == nil {
		t.Fatal("accepted zero rate")
	}
	if _, err := finance.Convert(finance.MaxMoney, rate, "USD"); err == nil {
		t.Fatal("accepted overflowing converted amount")
	}
}
