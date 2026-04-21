/**
 * Converts an amount from a foreign currency to BDT (base currency).
 *
 * @param originalAmountMinor - amount in the foreign currency's minor units
 * @param rateToBdtMinor - exchange rate: 1 foreign major unit = X BDT, stored as minor units (rate * 100)
 * @returns amount in BDT minor units
 */
export function convertToBdt(
  originalAmountMinor: number,
  rateToBdtMinor: number,
): number {
  return Math.round((originalAmountMinor * rateToBdtMinor) / 100);
}

export function isBdt(currencyCode: string): boolean {
  return currencyCode === "BDT";
}

export const BASE_CURRENCY_CODE = "BDT";
export const BASE_CURRENCY_RATE = 100;
