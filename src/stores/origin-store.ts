import { createStore } from "zustand/vanilla";

export type Origin = {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type OriginState = {
  origins: Origin[];
  loading: boolean;
  error: string | null;
};

type OriginActions = {
  fetchOrigins: (householdId: string) => Promise<void>;
  createOrigin: (
    householdId: string,
    input: { name: string; description?: string },
  ) => Promise<void>;
  deleteOrigin: (householdId: string, originId: string) => Promise<void>;
};

export type OriginStore = OriginState & OriginActions;

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

export const createOriginStore = () =>
  createStore<OriginStore>()((set, get) => ({
    origins: [],
    loading: false,
    error: null,

    fetchOrigins: async (householdId) => {
      set({ loading: true, error: null });
      try {
        const data = await apiRequest(`/api/households/${householdId}/origins`);
        set({ origins: data, loading: false });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    createOrigin: async (householdId, input) => {
      try {
        await apiRequest(`/api/households/${householdId}/origins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        await get().fetchOrigins(householdId);
      } catch (err) {
        throw err;
      }
    },

    deleteOrigin: async (householdId, originId) => {
      try {
        await apiRequest(`/api/households/${householdId}/origins/${originId}`, {
          method: "DELETE",
        });
        await get().fetchOrigins(householdId);
      } catch (err) {
        throw err;
      }
    },
  }));
