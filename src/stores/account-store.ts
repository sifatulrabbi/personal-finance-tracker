import { createStore } from "zustand/vanilla";

export type Account = {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  initialBalanceMinor: number;
  currentBalanceMinor: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateAccountInput = {
  name: string;
  description?: string;
  initialBalance: string;
};

export type UpdateAccountInput = {
  name?: string;
  description?: string;
};

type AccountState = {
  accounts: Account[];
  loading: boolean;
  error: string | null;
};

type AccountActions = {
  fetchAccounts: (householdId: string) => Promise<void>;
  createAccount: (
    householdId: string,
    input: CreateAccountInput,
  ) => Promise<void>;
  updateAccount: (
    householdId: string,
    accountId: string,
    input: UpdateAccountInput,
  ) => Promise<void>;
  deleteAccount: (householdId: string, accountId: string) => Promise<void>;
};

export type AccountStore = AccountState & AccountActions;

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return (await res.json()).data;
}

export const createAccountStore = () =>
  createStore<AccountStore>()((set, get) => ({
    accounts: [],
    loading: false,
    error: null,

    fetchAccounts: async (householdId) => {
      set({ loading: true, error: null });
      try {
        const data = await apiRequest(
          `/api/households/${householdId}/accounts`,
        );
        set({ accounts: data, loading: false });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    createAccount: async (householdId, input) => {
      try {
        await apiRequest(`/api/households/${householdId}/accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        await get().fetchAccounts(householdId);
      } catch (err) {
        throw err;
      }
    },

    updateAccount: async (householdId, accountId, input) => {
      try {
        await apiRequest(
          `/api/households/${householdId}/accounts/${accountId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        await get().fetchAccounts(householdId);
      } catch (err) {
        throw err;
      }
    },

    deleteAccount: async (householdId, accountId) => {
      try {
        await apiRequest(
          `/api/households/${householdId}/accounts/${accountId}`,
          { method: "DELETE" },
        );
        await get().fetchAccounts(householdId);
      } catch (err) {
        throw err;
      }
    },
  }));
