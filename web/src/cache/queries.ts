import { useMemo } from "react";
import {
  QueryClient,
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useApi } from "@/api/context";
import { isApiError } from "@/api/errors";
import type { Transaction, TransactionFilters, TransactionPage, Wallet } from "@/api/types";
import { keys, pageSize } from "./keys";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retry only failures that a retry can fix: the network or a server error.
        retry: (count, error) =>
          count < 2 && isApiError(error) && (error.network || error.status >= 500),
      },
      mutations: { retry: false },
    },
  });
}

// The Home screen figures in one read. Every total is the server's.
export function useSummary() {
  const api = useApi();
  return useQuery({ queryKey: keys.summary, queryFn: () => api.summary() });
}

// One wallet by id. The row already in the wallet list is shown while the read is in
// flight, so opening a wallet from the list never shows a skeleton.
export function useWallet(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.wallet(id),
    queryFn: () => api.wallet(id),
    placeholderData: () =>
      client.getQueryData<Wallet[]>(keys.wallets)?.find((wallet) => wallet.id === id),
  });
}

export function useWallets() {
  const api = useApi();
  return useQuery({ queryKey: keys.wallets, queryFn: () => api.wallets() });
}

export function useCategories() {
  const api = useApi();
  return useQuery({ queryKey: keys.categories, queryFn: () => api.categories() });
}

export function useSettings() {
  const api = useApi();
  return useQuery({ queryKey: keys.settings, queryFn: () => api.settings() });
}

export function useSchedules() {
  const api = useApi();
  return useQuery({ queryKey: keys.schedules, queryFn: () => api.schedules() });
}

export function useDueBills() {
  const api = useApi();
  return useQuery({ queryKey: keys.dueBills, queryFn: () => api.dueBills() });
}

// The Bills screen looks this far ahead for upcoming occurrences.
export const upcomingDays = 30;

export function useUpcomingBills() {
  const api = useApi();
  return useQuery({
    queryKey: keys.upcomingBills,
    queryFn: () => api.upcomingBills(upcomingDays),
  });
}

export const billHistoryPageSize = 20;

// Paid or skipped bills, newest first, a page at a time. Loaded only when shown.
export function useBillHistory(status: "paid" | "skipped", enabled = true) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.billHistory(status),
    enabled,
    queryFn: ({ pageParam }) =>
      api.bills(status, { limit: billHistoryPageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length < billHistoryPageSize ? undefined : pages.reduce((n, p) => n + p.length, 0),
  });
}

// Keeps the previous month on screen while another month loads, so the page never blanks.
export function useMonthly(month: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.monthly(month),
    queryFn: () => api.monthly(month),
    enabled: /^\d{4}-\d{2}$/.test(month),
    placeholderData: keepPreviousData,
  });
}

export function useHistory(id: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.history(id), queryFn: () => api.history(id) });
}

// One record list per filter combination, paged by cursor. "Load more" appends pages; a
// refetch refreshes every loaded page instead of collapsing the list to the first one.
// While other filters load, the previous list stays on screen (isPlaceholderData).
export function useTransactionList(filters: TransactionFilters) {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: keys.transactionList(filters),
    queryFn: ({ pageParam }) =>
      api.transactionPage({ ...filters, limit: pageSize, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  const records = useMemo(() => uniqueRecords(query.data?.pages ?? []), [query.data]);
  return { ...query, records };
}

// Pages never overlap on the server, but a record placed from a write can meet its own
// copy on a page loaded later. Show each record once, at its first position.
export function uniqueRecords(pages: TransactionPage[]) {
  const seen = new Set<string>();
  const out: Transaction[] = [];
  for (const page of pages)
    for (const record of page.items)
      if (!seen.has(record.id)) {
        seen.add(record.id);
        out.push(record);
      }
  return out;
}

export function useAudit(enabled: boolean) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.audit,
    enabled,
    queryFn: ({ pageParam }) => api.audit({ limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length < pageSize ? undefined : pages.reduce((n, p) => n + p.length, 0),
  });
}
