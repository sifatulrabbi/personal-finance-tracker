import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  Bill,
  Category,
  MonthlySpending,
  MonthlyTarget,
  Schedule,
  Settings,
  Transaction,
  TransactionFilters,
  TransactionPage,
  Wallet,
} from "@/api/types";
import { keys } from "./keys";

// What each write changes in the client cache. This is caching knowledge only, not a
// financial rule: the server's returned record goes straight into the cache so it shows
// without a round trip, and every server-computed value (balances, debt, monthly totals,
// due bills) is refetched rather than recalculated here. Only affected queries are touched.

// One cached record list: cursor pages of one filter combination.
export type TransactionPages = InfiniteData<TransactionPage, string | null>;

// Stored instants may carry 0 to 9 fraction digits. Padding makes them compare as strings.
function instantKey(value: string) {
  return value.replace(/(:\d{2})(?:\.(\d+))?Z$/, (_, seconds: string, fraction = "") =>
    `${seconds}.${fraction.padEnd(9, "0")}Z`,
  );
}

// The server lists records by date, then by the time of their current revision, newest
// first. A record placed from a write response is the newest write, so on a tie it goes first.
function sortsBefore(record: Transaction, row: Transaction) {
  if (record.date !== row.date) return record.date > row.date;
  const a = instantKey(record.created_at);
  const b = instantKey(row.created_at);
  return a === b || a > b;
}

// Whether a record belongs in a list with these filters, judged from the record's own
// fields. A wallet filter also matches records of a bank's linked debit cards; that is the
// server's rule, so such lists are refetched instead of decided here (see recordTransaction).
export function matchesFilters(record: Transaction, filters: TransactionFilters = {}) {
  if (record.voided && !filters.include_voided) return false;
  if (filters.kind && record.kind !== filters.kind) return false;
  if (filters.category_id && record.category_id !== filters.category_id) return false;
  if (filters.from && record.date < filters.from) return false;
  if (filters.to && record.date > filters.to) return false;
  if (
    filters.wallet_id &&
    record.wallet_id !== filters.wallet_id &&
    record.to_wallet_id !== filters.wallet_id
  )
    return false;
  return true;
}

// Places a record at its sorted position among the loaded pages of one list, replacing any
// older copy, or removes it when it no longer matches the list's filters. A record that sorts
// after everything loaded is left out while more pages exist: it belongs to a page the user
// has not loaded, and the cursor of that page still points after the last loaded row, so it
// arrives there without a repeat or a gap.
export function placeTransaction(
  data: TransactionPages | undefined,
  record: Transaction,
  filters: TransactionFilters = {},
): TransactionPages | undefined {
  if (!data) return data;
  // A record that names another wallet may still belong in a wallet's list (a bank lists
  // its debit cards' records). Only the server knows, so such a record is updated where it
  // already is, never removed or added here; the list's refetch settles it.
  const otherWallet =
    matchesFilters(record, { ...filters, wallet_id: undefined }) && !matchesFilters(record, filters);
  if (otherWallet)
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((row) => (row.id === record.id ? record : row)),
      })),
    };
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.filter((row) => row.id !== record.id),
  }));
  if (!matchesFilters(record, filters)) return { ...data, pages };
  for (const page of pages) {
    const index = page.items.findIndex((row) => sortsBefore(record, row));
    if (index >= 0) {
      page.items = [...page.items.slice(0, index), record, ...page.items.slice(index)];
      return { ...data, pages };
    }
  }
  const last = pages[pages.length - 1];
  if (!last) return { pages: [{ items: [record], next_cursor: null }], pageParams: [null] };
  if (last.next_cursor === null) last.items = [...last.items, record];
  return { ...data, pages };
}

function upsert<T extends { id: string }>(list: T[] | undefined, item: T) {
  if (!list) return list;
  return list.some((existing) => existing.id === item.id)
    ? list.map((existing) => (existing.id === item.id ? item : existing))
    : [...list, item];
}

function refetch(client: QueryClient, ...queryKeys: (readonly unknown[])[]) {
  for (const queryKey of queryKeys) void client.invalidateQueries({ queryKey });
}

// Marks a query stale without refetching now; it refreshes the next time a screen needs it.
function markStale(client: QueryClient, ...queryKeys: (readonly unknown[])[]) {
  for (const queryKey of queryKeys)
    void client.invalidateQueries({ queryKey, refetchType: "none" });
}

function recordTransaction(client: QueryClient, record: Transaction) {
  for (const [queryKey, data] of client.getQueriesData<TransactionPages>({
    queryKey: keys.transactionLists,
  })) {
    const filters = (queryKey[2] ?? {}) as TransactionFilters;
    client.setQueryData<TransactionPages>(queryKey, placeTransaction(data, record, filters));
    // A wallet's list also holds its linked debit cards' records, which only the server
    // knows how to match. Refetching refreshes each loaded page in place, never fewer.
    if (filters.wallet_id) void client.invalidateQueries({ queryKey, exact: true });
  }
  // The record is already in place; the lists are marked stale so a later visit reconciles
  // with changes from the other household member without replacing loaded pages now.
  markStale(client, keys.transactionLists);
}

export const effects = {
  walletCreated(client: QueryClient, wallet: Wallet) {
    client.setQueryData<Wallet[]>(keys.wallets, (list) => upsert(list, wallet));
    // A wallet with an opening balance also creates an opening record.
    refetch(client, keys.wallets, keys.transactions, keys.summary);
    markStale(client, keys.audit);
  },
  walletUpdated(client: QueryClient, wallet: Wallet) {
    client.setQueryData<Wallet[]>(keys.wallets, (list) => upsert(list, wallet));
    client.setQueryData(keys.wallet(wallet.id), wallet);
    markStale(client, keys.audit, keys.summary);
  },
  walletAdjusted(client: QueryClient, record: Transaction) {
    recordTransaction(client, record);
    refetch(client, keys.wallets, keys.walletAll, keys.summary);
    markStale(client, keys.audit);
  },
  transactionCreated(client: QueryClient, record: Transaction) {
    recordTransaction(client, record);
    refetch(client, keys.wallets, keys.walletAll, keys.monthlyAll, keys.summary);
  },
  transactionRevised(client: QueryClient, record: Transaction) {
    recordTransaction(client, record);
    // A voided bill payment makes its occurrence due again.
    refetch(
      client,
      keys.wallets,
      keys.walletAll,
      keys.monthlyAll,
      keys.summary,
      keys.history(record.id),
      keys.dueBills,
      keys.billHistoryAll,
    );
  },
  // Someone else changed the record: show their version and its history.
  transactionRefreshed(client: QueryClient, record: Transaction) {
    recordTransaction(client, record);
    refetch(client, keys.history(record.id));
  },
  categoryCreated(client: QueryClient, category: Category) {
    client.setQueryData<Category[]>(keys.categories, (list) => upsert(list, category));
    // Monthly lists every expense category, including unused ones.
    if (category.type === "expense") refetch(client, keys.monthlyAll);
  },
  settingsUpdated(client: QueryClient, settings: Settings) {
    client.setQueryData(keys.settings, settings);
    markStale(client, keys.audit);
  },
  monthlyTargetSet(client: QueryClient, month: string, target: MonthlyTarget) {
    client.setQueryData<MonthlySpending>(keys.monthly(month), (data) =>
      data ? { ...data, target } : data,
    );
    // A later month without its own target carries this one over (ADR 0010), so every
    // other loaded month is refreshed from the server rather than guessed here.
    void client.invalidateQueries({
      queryKey: keys.monthlyAll,
      predicate: (query) => query.queryKey[1] !== month,
    });
    refetch(client, keys.summary);
    markStale(client, keys.audit);
  },
  scheduleSaved(client: QueryClient, schedule: Schedule) {
    client.setQueryData<Schedule[]>(keys.schedules, (list) => upsert(list, schedule));
    refetch(client, keys.dueBills, keys.upcomingBills, keys.summary);
    markStale(client, keys.audit);
  },
  billConfirmed(client: QueryClient, billID: string, record: Transaction) {
    client.setQueryData<Bill[]>(keys.dueBills, (list) =>
      list?.filter((bill) => bill.id !== billID),
    );
    recordTransaction(client, record);
    refetch(
      client,
      keys.wallets,
      keys.walletAll,
      keys.monthlyAll,
      keys.dueBills,
      keys.billHistory("paid"),
      keys.summary,
    );
    markStale(client, keys.audit);
  },
  billSkipped(client: QueryClient, bill: Bill) {
    client.setQueryData<Bill[]>(keys.dueBills, (list) =>
      list?.filter((due) => due.id !== bill.id),
    );
    refetch(client, keys.dueBills, keys.billHistory("skipped"), keys.summary);
    markStale(client, keys.audit);
  },
};
