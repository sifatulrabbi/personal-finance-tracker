package ledger

import "simply-finance/internal/money"

// Formula rules (ADR 0014). A record may keep the calculation a person typed for an amount, as
// evidence of how they arrived at it. The amount stays the only financial value: a formula is
// accepted only when it evaluates exactly to the saved amount, and it is stored in canonical form.

// CheckFormula validates an optional formula for the amount minor, in the input field named
// field, and returns its canonical text ("" when none was sent).
func CheckFormula(field, formula string, minor int64) (string, error) {
	if formula == "" {
		return "", nil
	}
	if len(formula) > money.MaxFormulaBytes {
		return "", Invalid(field, "Keep the calculation to at most 200 bytes.")
	}
	f, err := money.ParseFormula(formula)
	if err != nil {
		return "", Invalid(field, "Enter a calculation with only numbers, + − × ÷ and brackets.")
	}
	if f.Minor != minor {
		return "", Invalid(field, "This calculation does not equal the amount.")
	}
	return f.Text, nil
}

// keepFormula is a correction's formula when it sent none: the prior one while it still equals
// the corrected amount, otherwise none.
func keepFormula(prior string, minor int64) string {
	if prior == "" {
		return ""
	}
	f, err := money.ParseFormula(prior)
	if err != nil || f.Minor != minor {
		return ""
	}
	return f.Text
}

// recordFormula resolves one of a record's formulas: a sent formula must equal the amount; an
// omitted one keeps the prior revision's while it still equals the amount.
func recordFormula(field, sent, prior string, minor int64) (string, error) {
	if sent == "" {
		return keepFormula(prior, minor), nil
	}
	return CheckFormula(field, sent, minor)
}
