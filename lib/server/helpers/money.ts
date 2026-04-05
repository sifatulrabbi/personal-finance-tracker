const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

/**
 * Converts a decimal money input into integer minor units.
 */
export function toMinorUnits(value: number | string): number {
  const normalizedValue =
    typeof value === "number" ? value.toString() : value.trim();

  if (!MONEY_PATTERN.test(normalizedValue)) {
    throw new Error(`Invalid money value: ${value}`);
  }

  const isNegative = normalizedValue.startsWith("-");
  const unsignedValue = isNegative ? normalizedValue.slice(1) : normalizedValue;
  const [wholePart, fractionalPart = ""] = unsignedValue.split(".");
  const minorUnits =
    Number.parseInt(wholePart, 10) * 100 +
    Number.parseInt(fractionalPart.padEnd(2, "0"), 10);

  return isNegative ? -minorUnits : minorUnits;
}

/**
 * Converts integer minor units back to a fixed 2-decimal display string.
 */
export function fromMinorUnits(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}
