import { createStore } from "zustand/vanilla";

export type Category = {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type CategoryState = {
  categories: Category[];
  loading: boolean;
  error: string | null;
};

type CategoryActions = {
  fetchCategories: (householdId: string) => Promise<void>;
  createCategory: (
    householdId: string,
    input: { name: string; description?: string },
  ) => Promise<void>;
  deleteCategory: (householdId: string, categoryId: string) => Promise<void>;
};

export type CategoryStore = CategoryState & CategoryActions;

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

export const createCategoryStore = () =>
  createStore<CategoryStore>()((set, get) => ({
    categories: [],
    loading: false,
    error: null,

    fetchCategories: async (householdId) => {
      set({ loading: true, error: null });
      try {
        const data = await apiRequest(
          `/api/households/${householdId}/categories`,
        );
        set({ categories: data, loading: false });
      } catch (err) {
        set({ error: (err as Error).message, loading: false });
      }
    },

    createCategory: async (householdId, input) => {
      try {
        await apiRequest(`/api/households/${householdId}/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        await get().fetchCategories(householdId);
      } catch (err) {
        throw err;
      }
    },

    deleteCategory: async (householdId, categoryId) => {
      try {
        await apiRequest(
          `/api/households/${householdId}/categories/${categoryId}`,
          { method: "DELETE" },
        );
        await get().fetchCategories(householdId);
      } catch (err) {
        throw err;
      }
    },
  }));
