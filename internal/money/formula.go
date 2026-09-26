package money

import (
	"math/big"
	"strings"
)

// MaxFormulaBytes is the longest calculation, as submitted, that a record may keep.
const MaxFormulaBytes = 200

// Formula is a validated calculation: its canonical text and its result in minor units.
//
// The grammar is plain decimal numbers, binary + - * /, unary - and +, and parentheses. Before
// parsing, a leading "=" is dropped, × x X read as *, ÷ as /, the Unicode minus as -, and
// thousands commas inside a whole number are removed. The result is exact (big.Rat) and rounded
// half away from zero to two decimal places. The web client's evaluator (web/src/money/formula.ts)
// follows the same rules, and both are tested against testdata/formulas.json.
//
// Canonical text puts one space around each binary operator and none elsewhere, keeps each number
// as typed (after comma removal), and uses ASCII operators: "120 + 45.50 + 300 * 2".
type Formula struct {
	Text  string
	Minor int64
}

// ParseFormula evaluates a calculation. Any text outside the grammar, a division by zero, or a
// result beyond MaxMoney is ErrInvalid.
func ParseFormula(s string) (Formula, error) {
	if len(s) > MaxFormulaBytes {
		return Formula{}, ErrInvalid
	}
	normalized, ok := normalizeFormula(s)
	if !ok {
		return Formula{}, ErrInvalid
	}
	tokens, ok := tokenize(normalized)
	if !ok || len(tokens) == 0 {
		return Formula{}, ErrInvalid
	}
	p := &parser{tokens: tokens}
	value, text, ok := p.expr()
	// The canonical text adds spaces around operators, so it is held to the same limit: what is
	// saved must itself be a formula this function accepts.
	if !ok || p.pos != len(tokens) || len(text) > MaxFormulaBytes {
		return Formula{}, ErrInvalid
	}
	minor, ok := roundHundredths(value)
	if !ok {
		return Formula{}, ErrInvalid
	}
	return Formula{Text: text, Minor: minor}, nil
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

// normalizeFormula applies the input conveniences and rejects any character outside the grammar.
func normalizeFormula(s string) (string, bool) {
	s = strings.TrimSpace(strings.ReplaceAll(s, " ", " "))
	s = strings.TrimSpace(strings.TrimPrefix(s, "="))
	s = strings.NewReplacer("×", "*", "÷", "/", "−", "-").Replace(s)
	// "0x10" reads as hexadecimal, not zero times ten: a number that is a lone 0 followed by x.
	for i := 0; i+1 < len(s); i++ {
		if s[i] == '0' && (s[i+1] == 'x' || s[i+1] == 'X') && (i == 0 || (!isDigit(s[i-1]) && s[i-1] != '.')) {
			return "", false
		}
	}
	s = strings.NewReplacer("x", "*", "X", "*").Replace(s)
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == ',' && groupComma(s, i) {
			continue
		}
		if !isDigit(c) && !strings.ContainsRune(".+-*/() ", rune(c)) {
			return "", false
		}
		b.WriteByte(c)
	}
	return b.String(), true
}

// groupComma reports whether the comma at i separates thousands in a whole number: a digit before
// it with no decimal point earlier in that number, and exactly three digits after it.
func groupComma(s string, i int) bool {
	if i == 0 || !isDigit(s[i-1]) || i+3 >= len(s) {
		return false
	}
	for j := i + 1; j <= i+3; j++ {
		if !isDigit(s[j]) {
			return false
		}
	}
	if i+4 < len(s) && isDigit(s[i+4]) {
		return false
	}
	j := i - 1
	for j >= 0 && (isDigit(s[j]) || s[j] == ',') {
		j--
	}
	return j < 0 || s[j] != '.'
}

type token struct {
	kind byte // 'n' for a number, otherwise the operator or parenthesis itself
	text string
}

// tokenize splits normalized text into numbers, operators, and parentheses. A number is digits
// with an optional fraction, or a fraction alone (".5"); a trailing dot ("5.") is refused.
func tokenize(s string) ([]token, bool) {
	var out []token
	for i := 0; i < len(s); {
		c := s[i]
		switch {
		case c == ' ':
			i++
		case isDigit(c) || c == '.':
			j := i
			for j < len(s) && (isDigit(s[j]) || s[j] == '.') {
				j++
			}
			if !validNumber(s[i:j]) {
				return nil, false
			}
			out = append(out, token{'n', s[i:j]})
			i = j
		default:
			out = append(out, token{c, string(c)})
			i++
		}
	}
	return out, true
}

func validNumber(s string) bool {
	whole, fraction, dotted := strings.Cut(s, ".")
	if strings.Contains(fraction, ".") {
		return false
	}
	if !dotted {
		return whole != ""
	}
	return fraction != ""
}

type parser struct {
	tokens []token
	pos    int
}

func (p *parser) peek() byte {
	if p.pos < len(p.tokens) {
		return p.tokens[p.pos].kind
	}
	return 0
}

// expr := term (("+" | "-") term)*
func (p *parser) expr() (*big.Rat, string, bool) {
	left, text, ok := p.term()
	for ok && (p.peek() == '+' || p.peek() == '-') {
		op := p.tokens[p.pos].kind
		p.pos++
		right, rtext, rok := p.term()
		if !rok {
			return nil, "", false
		}
		if op == '+' {
			left = new(big.Rat).Add(left, right)
		} else {
			left = new(big.Rat).Sub(left, right)
		}
		text += " " + string(op) + " " + rtext
	}
	return left, text, ok
}

// term := unary (("*" | "/") unary)*
func (p *parser) term() (*big.Rat, string, bool) {
	left, text, ok := p.unary()
	for ok && (p.peek() == '*' || p.peek() == '/') {
		op := p.tokens[p.pos].kind
		p.pos++
		right, rtext, rok := p.unary()
		if !rok {
			return nil, "", false
		}
		if op == '*' {
			left = new(big.Rat).Mul(left, right)
		} else {
			if right.Sign() == 0 {
				return nil, "", false
			}
			left = new(big.Rat).Quo(left, right)
		}
		text += " " + string(op) + " " + rtext
	}
	return left, text, ok
}

// unary := ("-" | "+") unary | primary
func (p *parser) unary() (*big.Rat, string, bool) {
	switch op := p.peek(); op {
	case '-', '+':
		p.pos++
		v, text, ok := p.unary()
		if !ok {
			return nil, "", false
		}
		if op == '-' {
			v = new(big.Rat).Neg(v)
		}
		return v, string(op) + text, true
	}
	return p.primary()
}

// primary := number | "(" expr ")"
func (p *parser) primary() (*big.Rat, string, bool) {
	switch p.peek() {
	case 'n':
		t := p.tokens[p.pos]
		p.pos++
		v, ok := new(big.Rat).SetString(t.text)
		return v, t.text, ok
	case '(':
		p.pos++
		v, text, ok := p.expr()
		if !ok || p.peek() != ')' {
			return nil, "", false
		}
		p.pos++
		return v, "(" + text + ")", true
	}
	return nil, "", false
}

// roundHundredths rounds v to minor units, half away from zero, within MaxMoney.
func roundHundredths(v *big.Rat) (int64, bool) {
	scaled := new(big.Rat).Mul(v, big.NewRat(100, 1))
	num := new(big.Int).Abs(scaled.Num())
	den := scaled.Denom()
	q, r := new(big.Int).QuoRem(num, den, new(big.Int))
	if new(big.Int).Lsh(r, 1).Cmp(den) >= 0 {
		q.Add(q, big.NewInt(1))
	}
	if !q.IsInt64() || q.Int64() > MaxMoney {
		return 0, false
	}
	n := q.Int64()
	if scaled.Sign() < 0 {
		n = -n
	}
	return n, true
}
