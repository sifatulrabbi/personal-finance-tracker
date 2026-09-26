import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDecimalInput } from "./decimal";
import { calculatedFrom, displayFormula, evaluateAmountInput, evaluateFormula } from "./formula";

// The same file drives internal/money/formula_test.go, so the client and the server agree on
// every case: same canonical text, same rounded result, same refusals.
const fixtures = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../internal/money/testdata/formulas.json"), "utf8"),
) as { valid: { input: string; canonical: string; amount: string }[]; invalid: string[] };

describe("evaluateFormula (shared fixtures)", () => {
  test("has fixtures", () => {
    expect(fixtures.valid.length).toBeGreaterThan(30);
    expect(fixtures.invalid.length).toBeGreaterThan(30);
  });
  for (const c of fixtures.valid)
    test(`valid ${JSON.stringify(c.input)}`, () => {
      expect(evaluateFormula(c.input)).toEqual({ ok: true, value: c.amount, formula: c.canonical });
      // Canonical text is itself a formula with the same result.
      expect(evaluateFormula(c.canonical)).toEqual({ ok: true, value: c.amount, formula: c.canonical });
    });
  for (const input of fixtures.invalid)
    test(`invalid ${JSON.stringify(input)}`, () => {
      expect(evaluateFormula(input).ok).toBe(false);
    });
});

describe("evaluateFormula limits", () => {
  test("the submitted text is at most 200 bytes, spaces included", () => {
    expect(evaluateFormula(`1+1${" ".repeat(197)}`)).toEqual({ ok: true, value: "2.00", formula: "1 + 1" });
    expect(evaluateFormula(`1+1${" ".repeat(198)}`).ok).toBe(false);
  });

  // Mirrors the Go regression: canonical text adds spaces, so it is held to 200 bytes too.
  test("the canonical text is at most 200 bytes", () => {
    expect(evaluateFormula(`${"0".repeat(100)}*${"0".repeat(98)}`).ok).toBe(false);
    const fits = evaluateFormula(`${"0".repeat(99)}*${"0".repeat(98)}`);
    expect(fits.ok && fits.formula.length).toBe(200);
  });

  test("errors say what to fix", () => {
    const message = (text: string) => {
      const r = evaluateFormula(text);
      return r.ok ? "" : r.message;
    };
    expect(message("1/0")).toContain("divide by zero");
    expect(message("2(3)")).toContain("operator between");
    expect(message("sqrt(4)")).toContain("Use only numbers");
    expect(message("5+")).toContain("missing or extra");
    expect(message("90000000000*2")).toContain("supported limit");
  });

  // Random sums of cents are exact: they equal the integer sum of their minor units.
  test("random sums of cents are exact", () => {
    let seed = 20260926;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const format = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
    for (let i = 0; i < 500; i++) {
      let sum = 0;
      let text = "";
      for (let j = 0, terms = 1 + next(12); j < terms; j++) {
        const minor = next(100_000_000);
        const minus = j > 0 && next(3) === 0;
        sum += minus ? -minor : minor;
        text += `${j === 0 ? "" : minus ? "-" : "+"}${format(minor)}`;
      }
      const result = evaluateFormula(text);
      const expected = `${sum < 0 ? "-" : ""}${format(Math.abs(sum))}`;
      expect(result.ok && result.value).toBe(expected);
    }
  });
});

describe("evaluateAmountInput", () => {
  test("a plain number keeps parseDecimalInput's behavior exactly", () => {
    for (const text of ["", "  ", "125.50", "1,020.50", ".5", "5.", "007.10", "1020,50", "1e3", "1.005", "12a", "1 000", "-5", "৳1,020"])
      expect(evaluateAmountInput(text)).toEqual(parseDecimalInput(text, { maxFraction: 2 }));
    expect(evaluateAmountInput("-5", { allowNegative: true })).toEqual({ kind: "valid", value: "-5" });
  });

  test("a calculation gives the rounded result and its canonical formula", () => {
    expect(evaluateAmountInput("120+45.50+300*2")).toEqual({ kind: "valid", value: "765.50", formula: "120 + 45.50 + 300 * 2" });
    expect(evaluateAmountInput("=100/3")).toEqual({ kind: "valid", value: "33.33", formula: "100 / 3" });
  });

  test("a calculation without a binary operator is only an amount", () => {
    expect(evaluateAmountInput("=5")).toEqual({ kind: "valid", value: "5.00" });
    expect(evaluateAmountInput("(12.5)")).toEqual({ kind: "valid", value: "12.50" });
  });

  test("a negative result needs allowNegative", () => {
    expect(evaluateAmountInput("5-10").kind).toBe("invalid");
    expect(evaluateAmountInput("5-10", { allowNegative: true })).toEqual({ kind: "valid", value: "-5.00", formula: "5 - 10" });
  });

  test("an invalid calculation is an error, never empty or a plain value", () => {
    for (const text of ["5+", "2^3", "sqrt(4)", "1/0", "(1+2"]) expect(evaluateAmountInput(text).kind).toBe("invalid");
  });

  test("calculatedFrom lists each kept calculation", () => {
    expect(calculatedFrom({})).toEqual([]);
    expect(calculatedFrom({ amount_formula: "120 + 45.50 + 300 * 2" })).toEqual(["Calculated from 120 + 45.50 + 300 × 2"]);
    expect(calculatedFrom({ amount_formula: "1 + 1", received_amount_formula: "10 / 4", balance_formula: "5 - 1" })).toEqual([
      "Calculated from 1 + 1",
      "Received calculated from 10 ÷ 4",
      "Balance calculated from 5 − 1",
    ]);
  });

  test("displayFormula shows people's operators", () => {
    expect(displayFormula("120 + 45.50 + 300 * 2")).toBe("120 + 45.50 + 300 × 2");
    expect(displayFormula("-5 / (2 - 1)")).toBe("−5 ÷ (2 − 1)");
    // What is displayed evaluates back to the same formula, so it can prefill a correction.
    expect(evaluateAmountInput(displayFormula("10 - (-5) / 2"))).toEqual({ kind: "valid", value: "12.50", formula: "10 - (-5) / 2" });
  });
});
