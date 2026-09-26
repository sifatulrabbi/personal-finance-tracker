import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  Bill,
  Category,
  MonthlySpending,
  MonthlyTarget,
  Schedule,
  Settings,
  Transaction,
  Wallet,
} from "@/api/types";
import { keys, pageSize } from "./keys";

// What each write changes in the client cache. This is caching knowledge only, not a
// financial rule: the server's returned record goes straight into the cache so it shows
// without a round trip, and every server-computed value (balances, debt, monthly totals,
// due bills) is refetched rather than recalculated here. Only affected queries are touched.

export type TransactionPages = InfiniteData<Transaction[], number>;

// The server lists records by date DESC, created_at DESC, id ASC.
function sortsBefore(a: Transaction, b: Transaction) {
  if (a.date !== b.date) return a.date > b.date;
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.id < b.id;
}

// Places a record at its sorted position among the loaded pages, replacing any older copy.
// A record that sorts after everything loaded is left out while more pages exist, because
// it belongs to a page the user has not loaded yet. Page sizes may drift from 50; the next
// offset is always the loaded count, which stays equal to the server's prefix.
export function placeTransaction(
  data: TransactionPages | undefined,
  record: Transaction,
): TransactionPages | undefined {
  if (!data) return data;
  const lastPage = data.pages[data.pages.length - 1] ?? [];
  const hasMore = lastPage.length >= pageSize;
  const pages = data.pages.map((page) => page.filter((row) => row.id !== record.id));
  for (let p = 0; p < pages.length; p++) {
    const index = pages[p].findIndex((row) => sortsBefore(record, row));
    if (index >= 0) {
      pages[p] = [...pages[p].slice(0, index), record, ...pages[p].slice(index)];
      return { ...data, pages };
    }
  }
  if (!hasMore) {
    if (pages.length === 0) return { pages: [[record]], pageParams: [0] };
    pages[pages.length - 1] = [...pages[pages.length - 1], record];
  }
  return { ...data, pages };
}

export function nextOffset(pages: Transaction[][]) {
  const last = pages[pages.length - 1];
  if (!last || last.length < pageSize) return undefined;
  return pages.reduce((count, page) => count + page.length, 0);
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
  client.setQueryData<TransactionPages>(keys.transactions, (data) =>
    placeTransaction(data, record),
  );
  // The record is already in place; the list is marked stale so a later visit reconciles
  // with changes from the other household member without replacing loaded pages now.
  markStale(client, keys.transactions);
}

export const effects = {
  walletCreated(client: QueryClient, wallet: Wallet) {
    client.setQueryData<Wallet[]>(keys.wallets, (list) => upsert(list, wallet));
    // A wallet with an opening balance also creates an opening record.
    refetch(client, keys.wallets, keys.transactions);
    markStale(client, keys.audit);
  },
  walletUpdated(client: QueryClient, wallet: Wallet) {
    client.setQueryData<Wallet[]>(keys.wallets, (list) => upsert(list, wallet));
    markStale(client, keys.audit);
  },
  walletAdjusted(client: QueryClient, record: Transaction) {
    recordTransaction(client, record);
    refetch(client, keys.wallets);
    markStale(client, keys.audit);
  },
  transactionCreated(client: QueryClient, record: Transaction) {
    recordTransaction(client, record);
    refetch(client, keys.wallets, keys.monthlyAll);
  },
  transactionRevised(client: QueryClient, record: Transaction) {
    recordTransaction(client, record);
    // A voided bill payment makes its occurrence due again.
    refetch(client, keys.wallets, keys.monthlyAll, keys.history(record.id), keys.dueBills);
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
  },
  scheduleSaved(client: QueryClient, schedule: Schedule) {
    client.setQueryData<Schedule[]>(keys.schedules, (list) => upsert(list, schedule));
    refetch(client, keys.dueBills);
    markStale(client, keys.audit);
  },
  billConfirmed(client: QueryClient, billID: string, record: Transaction) {
    client.setQueryData<Bill[]>(keys.dueBills, (list) =>
      list?.filter((bill) => bill.id !== billID),
    );
    recordTransaction(client, record);
    refetch(client, keys.wallets, keys.monthlyAll, keys.dueBills);
    markStale(client, keys.audit);
  },
  billSkipped(client: QueryClient, bill: Bill) {
    client.setQueryData<Bill[]>(keys.dueBills, (list) =>
      list?.filter((due) => due.id !== bill.id),
    );
    refetch(client, keys.dueBills);
    markStale(client, keys.audit);
  },
};
