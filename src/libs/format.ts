const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an integer in minor units (cents) as a USD currency string.
 * Example: 150000 → "$1,500.00", -5000 → "-$50.00"
 */
export function formatCurrency(minorUnits: number): string {
  return currencyFormatter.format(minorUnits / 100);
}
