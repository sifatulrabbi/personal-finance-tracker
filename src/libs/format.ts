const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currencyCode: string): Intl.NumberFormat {
  let formatter = formatterCache.get(currencyCode);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatterCache.set(currencyCode, formatter);
  }
  return formatter;
}

/**
 * Formats an integer in minor units as a BDT currency string.
 * All balances and totals are in BDT (the base currency).
 * Example: 150000 → "৳1,500.00"
 */
export function formatCurrency(minorUnits: number): string {
  return getFormatter("BDT").format(minorUnits / 100);
}

/**
 * Formats an integer in minor units in the specified currency.
 * Used for displaying the original transaction amount alongside the BDT conversion.
 */
export function formatOriginalCurrency(
  minorUnits: number,
  currencyCode: string,
): string {
  return getFormatter(currencyCode).format(minorUnits / 100);
}
