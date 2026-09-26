import type { TransactionFilters } from "@/api/types";

// What the Activity filter bar can choose. It lives in the URL search params so a refresh,
// the back button, or a shared link shows the same list.
export type ActivityKind = "expense" | "income" | "transfer";

export type ActivityFilters = {
  kind?: ActivityKind;
  wallet?: string;
  category?: string;
  from?: string;
  to?: string;
};

const kinds: readonly ActivityKind[] = ["expense", "income", "transfer"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
// Ids are short server strings; anything longer is not one of ours.
const idPattern = /^[\w-]{1,128}$/;

function validDate(value: string | null) {
  if (!value || !datePattern.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects dates such as 2026-02-31 that Date would roll over.
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}

function validId(value: string | null) {
  return value && idPattern.test(value) ? value : undefined;
}

// Reads filters from the URL. Unknown or malformed values are dropped, never guessed.
export function filtersFromParams(params: URLSearchParams): ActivityFilters {
  const kindParam = params.get("kind");
  const kind = kinds.find((k) => k === kindParam);
  let from = validDate(params.get("from"));
  let to = validDate(params.get("to"));
  // A reversed range is read the way it was meant.
  if (from && to && from > to) [from, to] = [to, from];
  const filters: ActivityFilters = {
    kind,
    wallet: validId(params.get("wallet")),
    // Transfers have no category, so the pair can only mean "nothing".
    category: kind === "transfer" ? undefined : validId(params.get("category")),
    from,
    to,
  };
  return compact(filters);
}

// Writes filters into search params, keeping any unrelated params already there.
export function paramsFromFilters(
  filters: ActivityFilters,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const name of ["kind", "wallet", "category", "from", "to"] as const) {
    const value = filters[name];
    if (value) params.set(name, value);
    else params.delete(name);
  }
  return params;
}

// Drops empty values, so equal filters always look the same (and share a cache entry).
export function compact(filters: ActivityFilters): ActivityFilters {
  const out: ActivityFilters = {};
  for (const name of ["kind", "wallet", "category", "from", "to"] as const) {
    const value = filters[name];
    if (value) (out as Record<string, string>)[name] = value;
  }
  return out;
}

export function hasFilters(filters: ActivityFilters) {
  return Object.keys(compact(filters)).length > 0;
}

// The first and last day of the Dhaka month `offset` months from today's (0 = this month,
// -1 = last month). String math only, so the device's time zone never shifts it.
export function monthRange(today: string, offset = 0): { from: string; to: string } {
  const [year, month] = today.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(Date.UTC(year, month + offset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A short name for a date range on the filter chip: "Sep 2026", "1 Sep – 15 Sep",
// "From 1 Sep", "Until 15 Sep".
export function rangeLabel({ from, to }: Pick<ActivityFilters, "from" | "to">, today: string) {
  const day = (date: string) => {
    const [year, month, d] = date.split("-").map(Number);
    const label = `${d} ${monthNames[month - 1]}`;
    return String(year) === today.slice(0, 4) ? label : `${label} ${year}`;
  };
  if (from && to) {
    const whole = monthRange(from);
    if (whole.from === from && whole.to === to) {
      const [year, month] = from.split("-").map(Number);
      return `${monthNames[month - 1]} ${year}`;
    }
    return from === to ? day(from) : `${day(from)} – ${day(to)}`;
  }
  if (from) return `From ${day(from)}`;
  if (to) return `Until ${day(to)}`;
  return "Any date";
}

// The list request for these filters. Activity always includes voided records, so a voided
// record stays visible (struck through) instead of disappearing.
export function listFilters(filters: ActivityFilters): TransactionFilters {
  const out: TransactionFilters = { include_voided: true };
  if (filters.kind) out.kind = filters.kind;
  if (filters.wallet) out.wallet_id = filters.wallet;
  if (filters.category) out.category_id = filters.category;
  if (filters.from) out.from = filters.from;
  if (filters.to) out.to = filters.to;
  return out;
}
