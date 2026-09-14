export type User = { id: string; email: string; name: string };
export type Category = { id: string; name: string; type: "income" | "expense" };
export type MonthlySpending = {
  month: string;
  spent: string;
  target: { amount: string; version: number };
  categories: {
    category_id: string;
    name: string;
    spent: string;
    percentage: string;
  }[];
};
export type Wallet = {
  id: string;
  name: string;
  type: string;
  card_type: string;
  currency: string;
  details: string;
  credit_limit: string;
  balance: string;
  debt?: string;
  available_credit?: string;
  archived: boolean;
  version: number;
};
export type Transaction = {
  category_id?: string;
  id: string;
  kind: string;
  wallet_id: string;
  to_wallet_id?: string;
  amount: string;
  received_amount?: string;
  rate?: string;
  date: string;
  note: string;
  reason: string;
  version: number;
  voided: boolean;
  bdt_amount: string;
  actor_email: string;
  created_at: string;
};
export type Settings = {
  rate: string;
  version: number;
  timezone: string;
  default_currency: string;
};
export type Schedule = {
  category_id?: string;
  id: string;
  name: string;
  wallet_id: string;
  amount: string;
  start_date: string;
  end_date?: string;
  frequency: string;
  note: string;
  version: number;
  active: boolean;
};
export type Bill = {
  id: string;
  schedule_id: string;
  due_date: string;
  wallet_id: string;
  amount: string;
  name: string;
  note: string;
  status: string;
};
export type Data = {
  categories: Category[];
  wallets: Wallet[];
  transactions: Transaction[];
  settings: Settings;
  schedules: Schedule[];
  bills: Bill[];
};
export type MutationKey = { fingerprint: string; key: string };

export function mutationKey(
  previous: MutationKey | undefined,
  path: string,
  body: unknown,
): MutationKey {
  const fingerprint = JSON.stringify([path, body]);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, key: crypto.randomUUID() };
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Protection": "1",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: "Check the values. Amounts need at most two decimal places. USD records need an exchange rate.",
      401: "Please sign in again, or check your email and password.",
      403: "This address is not allowed. Check APP_ORIGIN on the server.",
      409: "This record has changed or is already completed. Close this form and refresh before trying again.",
      429: "Too many sign-in attempts. Please wait one minute.",
    };
    throw new APIError(
      response.status,
      messages[response.status] ??
        "The request failed. Your entry is still here; you can retry.",
    );
  }
  return response.json() as Promise<T>;
}

export function moneyLabel(amount: string, currency: string) {
  const negative = amount.startsWith("-");
  const [whole, fraction = "00"] = amount.replace(/^-/, "").split(".");
  return `${currency === "USD" ? "US$" : "৳"}${negative ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

export function dhakaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function loadData(): Promise<Data> {
  const [wallets, transactions, settings, schedules, bills, categories] =
    await Promise.all([
      api<Wallet[]>("/wallets"),
      api<Transaction[]>("/transactions?limit=50"),
      api<Settings>("/settings"),
      api<Schedule[]>("/schedules"),
      api<Bill[]>("/bills/due"),
      api<Category[]>("/categories"),
    ]);
  return { wallets, transactions, settings, schedules, bills, categories };
}
