import {
  bignumberDependencies,
  create,
  parseDependencies,
  type BigNumber,
  type MathNode,
} from "mathjs";
import { parseDecimalInput } from "@/money/decimal";

// Calculations typed into an amount field, such as "120+45.50+300×2" (ADR 0014).
//
// The grammar matches the server's evaluator (internal/money/formula.go) exactly, and both run
// internal/money/testdata/formulas.json: plain decimal numbers, binary + - * /, unary - and +,
// and parentheses. A leading "=", × x X for *, ÷ for /, the Unicode minus, and thousands commas
// are accepted. The result is exact and rounded half away from zero to two decimals.
//
// mathjs parses; only its parser and BigNumber are bundled. Each value is kept as an exact
// fraction of BigNumber integers, never a rounded BigNumber quotient: 1/3*0.015 is exactly
// 0.005 and must round to 0.01 as it does on the server. 1000 significant digits hold every
// integer a 200-byte formula can produce, so no digit is ever lost.

const math = create(
  { parseDependencies, bignumberDependencies },
  { number: "BigNumber", precision: 1000 },
);

export const maxFormulaBytes = 200;
// The largest amount in minor units, as on the server (money.MaxMoney).
const maxMinor = math.bignumber("9000000000000");

export type FormulaResult =
  | { ok: true; value: string; formula: string }
  | { ok: false; message: string };

const messages = {
  tooLong: "This calculation is too long.",
  characters: "Use only numbers, + − × ÷ and brackets.",
  numbers: "Check the numbers in this calculation.",
  incomplete: "Check the calculation: an operator or bracket is missing or extra.",
  implicit: "Put an operator between numbers and brackets, for example 2 × (3 + 4).",
  zero: "A calculation cannot divide by zero.",
  tooLarge: "This result is larger than the supported limit.",
};

class FormulaError extends Error {}

const isDigit = (c: string) => c >= "0" && c <= "9";
const byteLength = (text: string) => new TextEncoder().encode(text).length;

// A comma that separates thousands in a whole number: a digit before it with no decimal point
// earlier in that number, and exactly three digits after it.
function groupComma(s: string, i: number) {
  if (i === 0 || !isDigit(s[i - 1]!) || i + 3 >= s.length) return false;
  for (let j = i + 1; j <= i + 3; j++) if (!isDigit(s[j]!)) return false;
  if (i + 4 < s.length && isDigit(s[i + 4]!)) return false;
  let j = i - 1;
  while (j >= 0 && (isDigit(s[j]!) || s[j] === ",")) j--;
  return j < 0 || s[j] !== ".";
}

const trimSpaces = (s: string) => s.replace(/^ +| +$/g, "");

function normalize(text: string): string {
  let s = trimSpaces(text.replace(/ /g, " "));
  s = trimSpaces(s.startsWith("=") ? s.slice(1) : s);
  s = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  // "0x10" reads as hexadecimal, not zero times ten: a number that is a lone 0 followed by x.
  for (let i = 0; i + 1 < s.length; i++) {
    const before = i === 0 ? "" : s[i - 1]!;
    if (s[i] === "0" && (s[i + 1] === "x" || s[i + 1] === "X") && (i === 0 || (!isDigit(before) && before !== ".")))
      throw new FormulaError(messages.characters);
  }
  s = s.replace(/[xX]/g, "*");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "," && groupComma(s, i)) continue;
    if (!isDigit(c) && !".+-*/() ".includes(c)) throw new FormulaError(messages.characters);
    out += c;
  }
  return out;
}

// The numbers in source order. A number is digits with an optional fraction, or a fraction
// alone (".5"); "5." is refused because mathjs would read "5.*2" as element-wise multiply.
function numbers(s: string): string[] {
  const out: string[] = [];
  for (const run of s.match(/[0-9.]+/g) ?? []) {
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(run)) throw new FormulaError(messages.numbers);
    out.push(run);
  }
  return out;
}

type Fraction = { n: BigNumber; d: BigNumber };

function constant(value: unknown): Fraction {
  if (!math.isBigNumber(value) || !value.isFinite()) throw new FormulaError(messages.characters);
  const d = math.bignumber(10).pow(value.decimalPlaces());
  return { n: value.times(d), d };
}

const binary: Record<string, string> = { add: "+", subtract: "-", multiply: "*", divide: "/" };

// Walks the parse tree, allowing only constants, the four operators, unary signs, and
// parentheses. Returns the exact value and the canonical text.
function walk(node: MathNode, texts: string[]): { value: Fraction; text: string } {
  if (node.type === "ConstantNode") {
    const text = texts.shift();
    if (text === undefined) throw new FormulaError(messages.characters);
    return { value: constant((node as unknown as { value: unknown }).value), text };
  }
  if (node.type === "ParenthesisNode") {
    const inner = walk((node as unknown as { content: MathNode }).content, texts);
    return { value: inner.value, text: `(${inner.text})` };
  }
  if (node.type !== "OperatorNode") throw new FormulaError(messages.characters);
  const op = node as unknown as { fn: string; args: MathNode[]; implicit: boolean };
  if (op.implicit) throw new FormulaError(messages.implicit);
  if ((op.fn === "unaryMinus" || op.fn === "unaryPlus") && op.args.length === 1) {
    const inner = walk(op.args[0]!, texts);
    const minus = op.fn === "unaryMinus";
    return {
      value: minus ? { n: inner.value.n.neg(), d: inner.value.d } : inner.value,
      text: `${minus ? "-" : "+"}${inner.text}`,
    };
  }
  const symbol = binary[op.fn];
  if (!symbol || op.args.length !== 2) throw new FormulaError(messages.characters);
  const left = walk(op.args[0]!, texts);
  const right = walk(op.args[1]!, texts);
  const a = left.value;
  const b = right.value;
  let value: Fraction;
  switch (symbol) {
    case "+":
      value = { n: a.n.times(b.d).plus(b.n.times(a.d)), d: a.d.times(b.d) };
      break;
    case "-":
      value = { n: a.n.times(b.d).minus(b.n.times(a.d)), d: a.d.times(b.d) };
      break;
    case "*":
      value = { n: a.n.times(b.n), d: a.d.times(b.d) };
      break;
    default:
      if (b.n.isZero()) throw new FormulaError(messages.zero);
      value = { n: a.n.times(b.d), d: a.d.times(b.n) };
      if (value.d.isNegative()) value = { n: value.n.neg(), d: value.d.neg() };
  }
  return { value, text: `${left.text} ${symbol} ${right.text}` };
}

// Minor units rounded half away from zero, as a two-decimal string.
function roundHundredths({ n, d }: Fraction): string {
  const scaled = n.abs().times(100);
  let q = scaled.divToInt(d);
  if (scaled.minus(q.times(d)).times(2).gte(d)) q = q.plus(1);
  if (q.gt(maxMinor)) throw new FormulaError(messages.tooLarge);
  const digits = q.toFixed(0).padStart(3, "0");
  const sign = n.isNegative() && !q.isZero() ? "-" : "";
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function evaluateFormula(text: string): FormulaResult {
  try {
    if (byteLength(text) > maxFormulaBytes) throw new FormulaError(messages.tooLong);
    const normalized = normalize(text);
    const texts = numbers(normalized);
    if (!normalized.trim()) throw new FormulaError(messages.incomplete);
    let tree: MathNode;
    try {
      tree = math.parse(normalized);
    } catch {
      throw new FormulaError(messages.incomplete);
    }
    const { value, text: formula } = walk(tree, texts);
    if (texts.length) throw new FormulaError(messages.incomplete);
    // What is saved must itself be a formula the server accepts.
    if (byteLength(formula) > maxFormulaBytes) throw new FormulaError(messages.tooLong);
    return { ok: true, value: roundHundredths(value), formula };
  } catch (problem) {
    if (problem instanceof FormulaError) return { ok: false, message: problem.message };
    throw problem;
  }
}

// Canonical text uses ASCII operators; people read × ÷ and the typographic minus.
export function displayFormula(formula: string) {
  return formula.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
}

export type AmountInput =
  | { kind: "empty" }
  | { kind: "valid"; value: string; formula?: string }
  | { kind: "invalid"; message: string };

// Text that is meant as a calculation rather than a mistyped number.
function looksLikeFormula(text: string) {
  const t = text.replace(/ /g, " ").trim();
  return t.startsWith("=") || /[+*/()×÷xX]/.test(t) || /.[-−]/.test(t);
}

// Reads an amount field. A plain number keeps parseDecimalInput's behavior exactly; anything
// that looks like a calculation is evaluated. A formula is returned only when it has an
// operator between two values, so "=5" or "-(5)" are just amounts.
export function evaluateAmountInput(
  text: string,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): AmountInput {
  const plain = parseDecimalInput(text, { maxFraction: 2, allowNegative });
  if (plain.kind !== "invalid" || !looksLikeFormula(text)) return plain;
  const result = evaluateFormula(text);
  if (!result.ok) return { kind: "invalid", message: result.message };
  if (result.value.startsWith("-") && !allowNegative)
    return { kind: "invalid", message: "The result is below zero. Enter a positive amount." };
  return result.formula.includes(" ")
    ? { kind: "valid", value: result.value, formula: result.formula }
    : { kind: "valid", value: result.value };
}
