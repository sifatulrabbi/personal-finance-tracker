import type { Currency, TransactionKind } from "@/api/types";

// Display only. Works on the decimal string the server sent: groups the whole part and keeps
// every fraction digit, so nothing is ever rounded or converted to a float.

// Which way money moved, from the household's point of view.
//  in: income (shown with +), out: an expense (shown with −), transfer: moved between
//  wallets (no sign), balance: a stored amount such as a wallet balance (sign only when
//  negative).
export type MoneyDirection = "in" | "out" | "transfer" | "balance";

// The color role a displayed amount takes. Color never carries meaning alone: every
// signed role also has a sign or a label next to it.
export type MoneyTone = "income" | "expense" | "transfer" | "negative" | "debt" | "neutral";

export const currencySymbol: Record<Currency, string> = { BDT: "৳", USD: "$" };

const minus = "−"; // U+2212, the typographic minus sign.

function group(whole: string) {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function symbolFor(currency: Currency | string) {
  return currency === "USD" ? currencySymbol.USD : currencySymbol.BDT;
}

export function isNegative(amount: string) {
  return /^-/.test(amount.trim()) && !/^-0*(\.0*)?$/.test(amount.trim());
}

export function isZero(amount: string) {
  return /^-?0*(\.0*)?$/.test(amount.trim());
}

// "1234.5" -> "৳1,234.50". The fraction keeps every digit sent and is padded to two.
export function formatMoney(
  amount: string,
  currency: Currency | string,
  direction: MoneyDirection = "balance",
) {
  const raw = amount.trim();
  const negative = isNegative(raw);
  const [whole = "0", fraction = ""] = raw.replace(/^[-+]/, "").split(".");
  const digits = `${symbolFor(currency)}${group(whole.replace(/^0+(?=\d)/, "") || "0")}.${fraction.padEnd(2, "0")}`;
  switch (direction) {
    case "in":
      return `${negative ? minus : "+"}${digits}`;
    case "out":
      // A negative expense (a refund booked as one) reads as money coming back.
      return `${negative ? "+" : minus}${digits}`;
    case "transfer":
      return digits;
    case "balance":
      return negative ? `${minus}${digits}` : digits;
  }
}

export function moneyTone(amount: string, direction: MoneyDirection, debt = false): MoneyTone {
  if (debt) return isZero(amount) ? "neutral" : "debt";
  switch (direction) {
    case "in":
      return "income";
    case "out":
      return "expense";
    case "transfer":
      return "transfer";
    case "balance":
      return isNegative(amount) ? "negative" : "neutral";
  }
}

// Opening balances and adjustments are balance changes, not income or spending.
export function directionForKind(kind: TransactionKind): MoneyDirection {
  if (kind === "income") return "in";
  if (kind === "expense") return "out";
  if (kind === "transfer") return "transfer";
  return "balance";
}

// Kept for places that show a plain amount inside a sentence.
export function moneyLabel(amount: string, currency: Currency | string) {
  return formatMoney(amount, currency, "balance");
}
