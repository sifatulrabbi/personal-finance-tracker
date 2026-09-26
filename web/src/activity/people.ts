import type { Currency, Transaction, Wallet } from "@/api/types";

// How a record's author reads in a list: "You" for the signed-in person, otherwise the part
// of the email before the @, capitalized. Enough to tell household members apart without
// repeating full emails on every row.
export function authorName(email: string, me?: string) {
  if (me && email.toLowerCase() === me.toLowerCase()) return "You";
  const local = email.split("@")[0] || email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// The currencies a revision was recorded in. A correction may move a record to a wallet of
// another currency, so every revision resolves its own wallets instead of borrowing the
// current record's. An unknown wallet (not loaded) falls back to BDT, the household default.
export function revisionCurrencies(
  revision: Pick<Transaction, "wallet_id" | "to_wallet_id">,
  wallets: Pick<Wallet, "id" | "currency">[],
): { currency: Currency; toCurrency?: Currency } {
  const find = (id?: string) => wallets.find((w) => w.id === id)?.currency;
  return {
    currency: find(revision.wallet_id) ?? "BDT",
    toCurrency: revision.to_wallet_id ? (find(revision.to_wallet_id) ?? "BDT") : undefined,
  };
}

const instant = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Dhaka",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// A stored instant as a household reads it, in Asia/Dhaka: "26 Sep 2026, 3:41 pm". Built
// from parts because engines join date and time differently ("," or "at").
export function dhakaDateTime(iso: string) {
  // The server writes nanoseconds; some engines only parse up to milliseconds.
  const date = new Date(iso.replace(/(\.\d{3})\d+/, "$1"));
  if (Number.isNaN(date.getTime())) return iso;
  const parts = instant.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod").toLowerCase()}`;
}

// "2026-09-24" as "24 Sep 2026", without any time zone math.
export function longDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}
