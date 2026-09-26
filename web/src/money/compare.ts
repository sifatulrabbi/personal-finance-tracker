// Exact comparisons of the server's decimal strings for display: which of two amounts is
// larger, how far apart they are, and how full a progress bar should be. The strings are
// scaled to integers (BigInt), so nothing is ever rounded through a float. Totals themselves
// always come from the server; these only compare two totals it already sent.

const shape = /^([-+])?(\d*)(?:\.(\d*))?$/;

function parts(amount: string) {
  const match = shape.exec(amount.trim());
  if (!match || (!match[2] && !match[3])) throw new Error(`Not a decimal: ${amount}`);
  return { negative: match[1] === "-", whole: match[2] || "0", fraction: match[3] ?? "" };
}

// The amount as an integer count of 10^-scale units.
function scaled(amount: string, scale: number) {
  const { negative, whole, fraction } = parts(amount);
  const value = BigInt(whole + fraction.padEnd(scale, "0").slice(0, scale));
  return negative ? -value : value;
}

function scaleOf(...amounts: string[]) {
  return Math.max(2, ...amounts.map((amount) => parts(amount).fraction.length));
}

export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const scale = scaleOf(a, b);
  const x = scaled(a, scale);
  const y = scaled(b, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

// a − b as a decimal string with at least two fraction digits.
export function subtractDecimal(a: string, b: string) {
  const scale = scaleOf(a, b);
  const difference = scaled(a, scale) - scaled(b, scale);
  const negative = difference < 0n;
  const digits = (negative ? -difference : difference).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

// How much of `whole` the `part` fills, as a whole percent from 0 to 100, for the width of
// a progress bar. Anything at or past the whole is a full bar; a zero or negative whole
// has nothing to fill.
export function fillPercent(part: string, whole: string) {
  const scale = scaleOf(part, whole);
  const p = scaled(part, scale);
  const w = scaled(whole, scale);
  if (w <= 0n || p <= 0n) return 0;
  if (p >= w) return 100;
  const percent = Number((p * 100n) / w);
  // A tiny but real amount still shows as a sliver.
  return Math.max(1, percent);
}
