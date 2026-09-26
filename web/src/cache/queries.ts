import { useMemo } from "react";
import {
  QueryClient,
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useApi } from "@/api/context";
import { isApiError } from "@/api/errors";
import type { Transaction } from "@/api/types";
import { keys, pageSize } from "./keys";
import { nextOffset } from "./effects";

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

// "Load older records" appends pages; a refetch refreshes every loaded page instead of
// collapsing the list back to the first 50.
export function useTransactions() {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: keys.transactions,
    queryFn: ({ pageParam }) => api.transactions({ limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (_last, pages) => nextOffset(pages),
  });
  const records = useMemo(() => uniqueRecords(query.data?.pages ?? []), [query.data]);
  return { ...query, records };
}

// Offset pages can overlap when records are added between page loads. Show each record once.
export function uniqueRecords(pages: Transaction[][]) {
  const seen = new Set<string>();
  const out: Transaction[] = [];
  for (const page of pages)
    for (const record of page)
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
