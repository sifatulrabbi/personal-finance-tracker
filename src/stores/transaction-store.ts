import { createStore } from "zustand/vanilla";

export type Transaction = {
  id: string;
  householdId: string;
  accountId: string;
  personId: string;
  categoryId: string | null;
  originId: string | null;
  createdByUserId: string;
  type: "income" | "expense";
  amountMinor: number;
  originalCurrencyCode: string;
  originalAmountMinor: number;
  exchangeRateToBdtMinor: number;
  description: string | null;
  transactionDate: string;
  transferGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; name: string };
  person: { id: string; name: string };
  category: { id: string; name: string } | null;
  origin: { id: string; name: string } | null;
};

export type TransactionFilters = {
  type: "all" | "expense" | "income" | "transfer";
  personId: string;
  categoryId: string;
  accountId: string;
};

export type TransactionMeta = {
  total: number;
  page: number;
  pageSize: number;
};

export type CreateExpenseInput = {
  accountId: string;
  personId: string;
  categoryId?: string;
  categoryName?: string;
  amount: string;
  currency?: string;
  description?: string;
  transactionDate: string;
};

export type CreateIncomeInput = CreateExpenseInput & {
  originId?: string;
  originName?: string;
};

export type UpdateTransactionInput = {
  accountId?: string;
  personId?: string;
  categoryId?: string;
  categoryName?: string;
  originId?: string;
  originName?: string;
  amount?: string;
  currency?: string;
  description?: string;
  transactionDate?: string;
};

export type CreateTransferInput = {
  sourceAccountId: string;
  destinationAccountId: string;
  personId: string;
  amount: string;
  transactionDate: string;
  description?: string;
};

type TransactionState = {
  transactions: Transaction[];
  meta: TransactionMeta;
  filters: TransactionFilters;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

type TransactionActions = {
  fetchTransactions: (householdId: string) => Promise<void>;
  loadMore: (householdId: string) => Promise<void>;
  setFilters: (filters: Partial<TransactionFilters>) => void;
  createExpense: (
    householdId: string,
    input: CreateExpenseInput,
  ) => Promise<void>;
  createIncome: (
    householdId: string,
    input: CreateIncomeInput,
  ) => Promise<void>;
  createTransfer: (
    householdId: string,
    input: CreateTransferInput,
  ) => Promise<void>;
  updateTransaction: (
    householdId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ) => Promise<void>;
  deleteTransaction: (
    householdId: string,
    transactionId: string,
  ) => Promise<void>;
};

export type TransactionStore = TransactionState & TransactionActions;

function buildQueryString(
  filters: TransactionFilters,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams();
  // "transfer" is filtered client-side (by transferGroupId); "all" sends no type param
  if (filters.type === "expense" || filters.type === "income") {
    params.set("type", filters.type);
  }
  if (filters.personId) params.set("personId", filters.personId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.accountId) params.set("accountId", filters.accountId);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const createTransactionStore = () =>
  createStore<TransactionStore>()((set, get) => ({
    transactions: [],
    meta: { total: 0, page: 1, pageSize: 20 },
    filters: { type: "all", personId: "", categoryId: "", accountId: "" },
    loading: false,
    loadingMore: false,
    error: null,

    fetchTransactions: async (householdId) => {
      const { filters, meta } = get();
      set({ loading: true, error: null });
      try {
        const qs = buildQueryString(filters, 1, meta.pageSize);
        const json = await apiRequest(
          `/api/households/${householdId}/transactions?${qs}`,
        );
        set({
          transactions: json.data,
          meta: json.meta,
          loading: false,
        });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    loadMore: async (householdId) => {
      const { meta, filters } = get();
      const snapshotFilters = filters;
      set({ loadingMore: true });
      try {
        const qs = buildQueryString(filters, meta.page + 1, meta.pageSize);
        const json = await apiRequest(
          `/api/households/${householdId}/transactions?${qs}`,
        );
        // Discard results if filters changed while the request was in flight
        if (get().filters !== snapshotFilters) {
          set({ loadingMore: false });
          return;
        }
        set((state) => ({
          transactions: [...state.transactions, ...json.data],
          meta: json.meta,
          loadingMore: false,
        }));
      } catch (err) {
        set({ error: (err as Error).message, loadingMore: false });
      }
    },

    setFilters: (partial) => {
      const { filters } = get();
      set({ filters: { ...filters, ...partial } });
    },

    createExpense: async (householdId, input) => {
      await apiRequest(`/api/households/${householdId}/transactions/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await get().fetchTransactions(householdId);
    },

    createIncome: async (householdId, input) => {
      await apiRequest(`/api/households/${householdId}/transactions/income`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await get().fetchTransactions(householdId);
    },

    createTransfer: async (householdId, input) => {
      // Transfers create two transactions (one expense + one income) on the
      // backend linked by transferGroupId. Refetch the list so both show up.
      // Account balances shift too — callers refresh those separately because
      // the account store is outside this domain.
      await apiRequest(`/api/households/${householdId}/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await get().fetchTransactions(householdId);
    },

    updateTransaction: async (householdId, transactionId, input) => {
      await apiRequest(
        `/api/households/${householdId}/transactions/${transactionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await get().fetchTransactions(householdId);
    },

    deleteTransaction: async (householdId, transactionId) => {
      await apiRequest(
        `/api/households/${householdId}/transactions/${transactionId}`,
        { method: "DELETE" },
      );
      await get().fetchTransactions(householdId);
    },
  }));
