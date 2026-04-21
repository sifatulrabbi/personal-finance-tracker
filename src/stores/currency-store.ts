import { createStore } from "zustand/vanilla";

export type Currency = {
  id: string;
  householdId: string;
  code: string;
  symbol: string;
  name: string;
  rateToBdtMinor: number;
  isBase: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCurrencyInput = {
  code: string;
  symbol: string;
  name: string;
  rateToBdt: string;
};

export type UpdateCurrencyInput = {
  symbol?: string;
  name?: string;
  rateToBdt?: string;
};

type CurrencyState = {
  currencies: Currency[];
  loading: boolean;
  error: string | null;
};

type CurrencyActions = {
  fetchCurrencies: (householdId: string) => Promise<void>;
  createCurrency: (
    householdId: string,
    input: CreateCurrencyInput,
  ) => Promise<void>;
  updateCurrency: (
    householdId: string,
    currencyId: string,
    input: UpdateCurrencyInput,
  ) => Promise<void>;
  deleteCurrency: (householdId: string, currencyId: string) => Promise<void>;
};

export type CurrencyStore = CurrencyState & CurrencyActions;

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

export const createCurrencyStore = () =>
  createStore<CurrencyStore>()((set, get) => ({
    currencies: [],
    loading: false,
    error: null,

    fetchCurrencies: async (householdId) => {
      set({ loading: true, error: null });
      try {
        const data = await apiRequest(
          `/api/households/${householdId}/currencies`,
        );
        set({ currencies: data, loading: false });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    createCurrency: async (householdId, input) => {
      await apiRequest(`/api/households/${householdId}/currencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await get().fetchCurrencies(householdId);
    },

    updateCurrency: async (householdId, currencyId, input) => {
      await apiRequest(
        `/api/households/${householdId}/currencies/${currencyId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      await get().fetchCurrencies(householdId);
    },

    deleteCurrency: async (householdId, currencyId) => {
      await apiRequest(
        `/api/households/${householdId}/currencies/${currencyId}`,
        { method: "DELETE" },
      );
      await get().fetchCurrencies(householdId);
    },
  }));
