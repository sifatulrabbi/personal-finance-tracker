import { createStore } from "zustand/vanilla";

export type Person = {
  id: string;
  householdId: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type PersonState = {
  people: Person[];
  loading: boolean;
  error: string | null;
};

type PersonActions = {
  fetchPeople: (householdId: string) => Promise<void>;
  createPerson: (householdId: string, name: string) => Promise<void>;
  deletePerson: (householdId: string, personId: string) => Promise<void>;
};

export type PersonStore = PersonState & PersonActions;

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

export const createPersonStore = () =>
  createStore<PersonStore>()((set, get) => ({
    people: [],
    loading: false,
    error: null,

    fetchPeople: async (householdId) => {
      set({ loading: true, error: null });
      try {
        const data = await apiRequest(`/api/households/${householdId}/people`);
        set({ people: data, loading: false });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    createPerson: async (householdId, name) => {
      try {
        await apiRequest(`/api/households/${householdId}/people`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        await get().fetchPeople(householdId);
      } catch (err) {
        throw err;
      }
    },

    deletePerson: async (householdId, personId) => {
      try {
        await apiRequest(`/api/households/${householdId}/people/${personId}`, {
          method: "DELETE",
        });
        await get().fetchPeople(householdId);
      } catch (err) {
        throw err;
      }
    },
  }));
