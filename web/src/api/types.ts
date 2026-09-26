// Request and response payloads for /api/v1, hand-written to match docs/api.md and the Go
// structs in internal/finance (the field contract). Keep every API shape in this one module
// until types are generated from Go. Money and rates are decimal strings; never convert them
// to numbers.

export type Currency = "BDT" | "USD";
export type WalletType = "physical" | "bank" | "digital" | "card";
export type CardType = "" | "debit" | "credit";
export type CategoryType = "income" | "expense";
export type TransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "opening"
  | "adjustment";
export type Frequency = "weekly" | "monthly" | "yearly";

export type User = { id: string; email: string; name: string };

export type LoginInput = { email: string; password: string };

export type Category = { id: string; name: string; type: CategoryType };
export type CategoryInput = { name: string; type: CategoryType };

export type Wallet = {
  id: string;
  name: string;
  type: WalletType;
  card_type: CardType;
  currency: Currency;
  details: string;
  credit_limit: string;
  balance: string;
  // Present only for credit cards. A negative debt means the card is overpaid.
  debt?: string;
  available_credit?: string;
  // A linked debit card has no balance of its own; its records move this bank wallet.
  bank_wallet_id?: string;
  archived: boolean;
  // version guards metadata edits; balance_version guards adjustments.
  version: number;
  balance_version: number;
};

export type WalletInput = {
  name: string;
  type: WalletType;
  card_type: CardType;
  currency: Currency;
  details: string;
  opening_balance: string;
  credit_limit: string;
  bank_wallet_id?: string;
  // The calculation that gave opening_balance; kept on the opening record (ADR 0014).
  opening_balance_formula?: string;
};

// The PUT body is decoded strictly into the Go Wallet struct, so send only input fields and
// never echo response-only fields such as balance or debt. Type, card type, and currency must
// match the stored wallet; the server rejects changes to them.
export type WalletUpdate = {
  id: string;
  name: string;
  type: WalletType;
  card_type: CardType;
  currency: Currency;
  details: string;
  credit_limit: string;
  bank_wallet_id?: string;
  archived: boolean;
  version: number;
};

export type WalletAdjustment = {
  balance_version: number;
  balance: string;
  reason: string;
  // The calculation that gave the target balance (ADR 0014).
  balance_formula?: string;
};

export type Transaction = {
  id: string;
  kind: TransactionKind;
  category_id?: string;
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
  // Canonical calculations that gave the amounts, when one was typed (ADR 0014). An
  // adjustment's formula is for the target balance, since its amount is the difference.
  amount_formula?: string;
  received_amount_formula?: string;
  balance_formula?: string;
};

export type TransactionInput = {
  kind: "income" | "expense" | "transfer";
  category_id?: string;
  wallet_id: string;
  to_wallet_id?: string;
  amount: string;
  received_amount?: string;
  rate?: string;
  date: string;
  note: string;
  reason?: string;
  amount_formula?: string;
  received_amount_formula?: string;
};

export type TransactionCorrection = TransactionInput & { version: number };
export type TransactionVoid = { version: number; reason: string };

export type Settings = {
  rate: string;
  version: number;
  timezone: string;
  default_currency: Currency;
};
export type SettingsUpdate = { rate: string; version: number };

export type Schedule = {
  id: string;
  category_id?: string;
  name: string;
  wallet_id: string;
  amount: string;
  start_date: string;
  end_date?: string;
  frequency: Frequency;
  note: string;
  version: number;
  active: boolean;
};

export type ScheduleInput = {
  category_id?: string;
  name: string;
  wallet_id: string;
  amount: string;
  start_date: string;
  end_date?: string;
  frequency: Frequency;
  note: string;
};

// Start date and frequency are immutable; the server expects the stored values back.
export type ScheduleUpdate = ScheduleInput & {
  id: string;
  version: number;
  active: boolean;
};

export type Bill = {
  id: string;
  schedule_id: string;
  category_id: string;
  due_date: string;
  wallet_id: string;
  amount: string;
  name: string;
  note: string;
  status: string;
  transaction_id?: string;
};

// An omitted or empty amount uses the occurrence's expected amount (ADR 0004). An entered
// amount that does not parse must be rejected on the client, never sent as empty.
export type PaymentInput = {
  amount: string;
  wallet_id: string;
  date: string;
  rate: string;
  note: string;
  amount_formula?: string;
};
export type SkipInput = { reason: string };

// inherited_from names the earlier month whose saved target carries over (ADR 0010).
export type MonthlyTarget = { amount: string; version: number; inherited_from?: string };
export type MonthlySpending = {
  month: string;
  spent: string;
  target: MonthlyTarget;
  categories: {
    category_id: string;
    name: string;
    spent: string;
    percentage: string;
  }[];
};
export type MonthlyTargetUpdate = { amount: string; version: number };

// A future occurrence computed from an active schedule. It is not stored, so it has no id
// and cannot be paid until it comes due.
export type UpcomingBill = {
  schedule_id: string;
  due_date: string;
  wallet_id: string;
  amount: string;
  name: string;
  note: string;
  category_id: string;
};

export type BillStatus = "due" | "paid" | "skipped";

// GET /summary: the Home screen figures, all computed by the server.
export type CurrencyTotal = {
  currency: Currency;
  cash: string;
  card_debt: string;
  available_credit: string;
};
export type Summary = {
  today: string;
  totals: CurrencyTotal[];
  month: { month: string; spent: string; target: MonthlyTarget };
  bills: { due_count: number; oldest_due_date?: string; next_due_date?: string };
  recent: Transaction[];
  legacy_debit_cards: number;
};

export type AuditEvent = {
  id: number;
  actor_email: string;
  entity_id: string;
  action: string;
  before: unknown;
  after: unknown;
  created_at: string;
};

export type Page = { limit: number; offset: number };

// Filters of the cursor-paged record list (docs/api.md, Lists). Omitted fields do not
// filter. Voided records are left out unless include_voided is true.
export type TransactionFilters = {
  wallet_id?: string;
  kind?: TransactionKind;
  category_id?: string;
  from?: string;
  to?: string;
  include_voided?: boolean;
};

export type TransactionQuery = TransactionFilters & {
  limit: number;
  // The previous page's next_cursor, sent unchanged. Omitted for the first page.
  cursor?: string;
};

export type TransactionPage = { items: Transaction[]; next_cursor: string | null };

// Error codes from the shared error contract (PLAN.md, "Working method"). Legacy bodies carry
// no code; the client derives one from the status.
export type ErrorCode =
  | "validation_failed"
  | "stale_version"
  | "idempotency_key_reused"
  | "archived_wallet"
  | "rate_required"
  | "duplicate_name"
  | "already_settled"
  | "not_correctable"
  | "not_found"
  | "unauthenticated"
  | "forbidden"
  | "unsupported_media_type"
  | "method_not_allowed"
  | "rate_limited"
  | "internal"
  | "network";
