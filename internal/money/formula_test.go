package money_test

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"testing"

	"simply-finance/internal/money"
)

type formulaFixtures struct {
	Valid []struct {
		Input, Canonical, Amount string
	}
	Invalid []string
}

func loadFormulaFixtures(t testing.TB) formulaFixtures {
	t.Helper()
	b, err := os.ReadFile("testdata/formulas.json")
	if err != nil {
		t.Fatal(err)
	}
	var f formulaFixtures
	if err = json.Unmarshal(b, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Valid) == 0 || len(f.Invalid) == 0 {
		t.Fatal("empty fixtures")
	}
	return f
}

// The same fixtures run in web/src/money/formula.test.ts, so both evaluators agree case by case.
func TestParseFormulaSharedFixtures(t *testing.T) {
	f := loadFormulaFixtures(t)
	for _, c := range f.Valid {
		got, err := money.ParseFormula(c.Input)
		if err != nil {
			t.Errorf("%q: %v", c.Input, err)
			continue
		}
		if got.Text != c.Canonical || money.FormatMoney(got.Minor) != c.Amount {
			t.Errorf("%q = %q %s, want %q %s", c.Input, got.Text, money.FormatMoney(got.Minor), c.Canonical, c.Amount)
		}
		// Canonical text is itself a valid formula with the same result.
		again, err := money.ParseFormula(got.Text)
		if err != nil || again != got {
			t.Errorf("canonical %q reparsed as %+v %v", got.Text, again, err)
		}
	}
	for _, input := range f.Invalid {
		if got, err := money.ParseFormula(input); err == nil {
			t.Errorf("%q accepted as %+v", input, got)
		}
	}
}

func TestParseFormulaLength(t *testing.T) {
	// The submitted text is limited before trimming, so trailing spaces count.
	ok := "1+1" + strings.Repeat(" ", 197) // 200 bytes
	if f, err := money.ParseFormula(ok); err != nil || f.Minor != 200 || f.Text != "1 + 1" {
		t.Fatalf("200 bytes: %+v %v", f, err)
	}
	if _, err := money.ParseFormula(ok + " "); err == nil {
		t.Fatal("201 bytes accepted")
	}
}

// Regression (found by FuzzParseFormula): canonical text adds spaces, so a short input could
// canonicalize to more than 200 bytes that no longer reparses. Such input is refused.
func TestParseFormulaCanonicalLength(t *testing.T) {
	compact := strings.Repeat("0", 100) + "*" + strings.Repeat("0", 98) // 199 bytes
	if _, err := money.ParseFormula(compact); err == nil {
		t.Fatal("canonical text of 201 bytes accepted")
	}
	fits := strings.Repeat("0", 99) + "*" + strings.Repeat("0", 98) // canonical 200 bytes
	if f, err := money.ParseFormula(fits); err != nil || len(f.Text) != 200 {
		t.Fatalf("canonical text of 200 bytes: %+v %v", f, err)
	}
}

// A sum of amounts with two decimals is exact: it equals the integer sum of their minor units.
func TestFormulaRandomSumsOfCentsAreExact(t *testing.T) {
	rng := rand.New(rand.NewSource(20260926))
	for i := 0; i < 5000; i++ {
		terms := 1 + rng.Intn(12)
		var sum int64
		parts := make([]string, terms)
		for j := range parts {
			n := rng.Int63n(100_000_000) // up to 999,999.99
			if j > 0 && rng.Intn(3) == 0 {
				parts[j] = "-" + money.FormatMoney(n)
				sum -= n
			} else {
				parts[j] = "+" + money.FormatMoney(n)
				sum += n
			}
		}
		text := strings.TrimPrefix(strings.Join(parts, ""), "+")
		got, err := money.ParseFormula(text)
		if err != nil || got.Minor != sum {
			t.Fatalf("%q = %d %v, want %d", text, got.Minor, err, sum)
		}
	}
}

// A product of an amount and a whole count is exact too, and multiplication by n/n is identity.
func TestFormulaRandomProductsAreExact(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	for i := 0; i < 5000; i++ {
		n := rng.Int63n(1_000_000_00)
		k := 1 + rng.Int63n(999)
		d := 1 + rng.Int63n(97)
		text := fmt.Sprintf("%s * %d * %d / %d", money.FormatMoney(n), k, d, d)
		got, err := money.ParseFormula(text)
		if err != nil || got.Minor != n*k {
			t.Fatalf("%q = %d %v, want %d", text, got.Minor, err, n*k)
		}
	}
}

// Arbitrary input never panics, and any accepted formula's canonical text evaluates the same.
func FuzzParseFormula(f *testing.F) {
	for _, c := range loadFormulaFixtures(f).Valid {
		f.Add(c.Input)
	}
	f.Add("((((((1")
	f.Add("1,000,000,000")
	f.Fuzz(func(t *testing.T, s string) {
		got, err := money.ParseFormula(s)
		if err != nil {
			return
		}
		if got.Minor > money.MaxMoney || got.Minor < -money.MaxMoney {
			t.Fatalf("%q out of range: %d", s, got.Minor)
		}
		again, err := money.ParseFormula(got.Text)
		if err != nil || again != got {
			t.Fatalf("%q canonical %q reparsed as %+v %v", s, got.Text, again, err)
		}
	})
}
