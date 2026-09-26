import type { Currency } from "@/api/types";

// Display only: groups the whole part and keeps every decimal digit as sent by the server.
export function moneyLabel(amount: string, currency: Currency | string) {
  const negative = amount.startsWith("-");
  const [whole, fraction = "00"] = amount.replace(/^-/, "").split(".");
  return `${currency === "USD" ? "US$" : "৳"}${negative ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
