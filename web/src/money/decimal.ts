// Format-only parsing of typed amounts and rates. It works on strings and never converts to
// a number, so no value is ever rounded. The server remains the authority on whether an
// amount is allowed (zero, limits, currency rules); this only decides whether the text is a
// well-formed decimal.

export type DecimalInput =
  | { kind: "empty" }
  | { kind: "valid"; value: string }
  | { kind: "invalid"; message: string };

export type DecimalOptions = {
  // Money uses 2, exchange rates use 6.
  maxFraction?: number;
  allowNegative?: boolean;
};

const maxLength = 40;
// Optional sign, then either plain digits or digits grouped by thousands commas, then an
// optional dot and fraction. At least one digit must appear somewhere (checked separately).
const shape = /^(-)?(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/;

export function parseDecimalInput(
  text: string,
  { maxFraction = 2, allowNegative = false }: DecimalOptions = {},
): DecimalInput {
  // Unicode minus and non-breaking spaces come from some keyboards and copied labels.
  const trimmed = text.replace(/−/g, "-").replace(/ /g, " ").trim();
  if (!trimmed) return { kind: "empty" };
  const example = maxFraction > 2 ? "125.50" : "1020.50";
  if (trimmed.length > maxLength)
    return { kind: "invalid", message: "This number is too long." };
  const match = shape.exec(trimmed);
  if (!match) {
    if (trimmed.includes(","))
      return {
        kind: "invalid",
        message: `Use a dot for decimals, for example ${example}.`,
      };
    return {
      kind: "invalid",
      message: `Enter digits only, for example ${example}.`,
    };
  }
  const [, sign = "", wholeText, fraction = ""] = match;
  const whole = wholeText.replace(/,/g, "");
  if (!whole && !fraction)
    return { kind: "invalid", message: `Enter digits only, for example ${example}.` };
  if (sign && !allowNegative)
    return { kind: "invalid", message: "Enter the amount without a minus sign." };
  if (fraction.length > maxFraction)
    return {
      kind: "invalid",
      message: `Use at most ${maxFraction} decimal places.`,
    };
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  const value = `${sign}${normalizedWhole}${fraction ? `.${fraction}` : ""}`;
  // "-0" and "-0.00" mean zero; send them without a sign.
  return { kind: "valid", value: /^-0(\.0*)?$/.test(value) ? value.slice(1) : value };
}
