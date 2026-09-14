package finance_test

import (
	"simply-finance/internal/finance"
	"testing"
)

func FuzzMoneyRoundTrip(f *testing.F) {
	for _, n := range []int64{0, 1, -1, 99999, finance.MaxMoney, -finance.MaxMoney} {
		f.Add(n)
	}
	f.Fuzz(func(t *testing.T, n int64) {
		if n > finance.MaxMoney || n < -finance.MaxMoney {
			return
		}
		got, err := finance.ParseMoney(finance.FormatMoney(n))
		if err != nil || got != n {
			t.Fatalf("round trip %d: %d %v", n, got, err)
		}
	})
}
