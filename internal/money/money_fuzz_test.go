package money_test

import (
	"simply-finance/internal/money"
	"testing"
)

func FuzzMoneyRoundTrip(f *testing.F) {
	for _, n := range []int64{0, 1, -1, 99999, money.MaxMoney, -money.MaxMoney} {
		f.Add(n)
	}
	f.Fuzz(func(t *testing.T, n int64) {
		if n > money.MaxMoney || n < -money.MaxMoney {
			return
		}
		got, err := money.ParseMoney(money.FormatMoney(n))
		if err != nil || got != n {
			t.Fatalf("round trip %d: %d %v", n, got, err)
		}
	})
}
