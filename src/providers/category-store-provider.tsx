"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import {
  createCategoryStore,
  type CategoryStore,
} from "@/stores/category-store";

type CategoryStoreApi = ReturnType<typeof createCategoryStore>;

const CategoryStoreContext = createContext<CategoryStoreApi | undefined>(
  undefined,
);

export function CategoryStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createCategoryStore());
  return (
    <CategoryStoreContext.Provider value={store}>
      {children}
    </CategoryStoreContext.Provider>
  );
}

export function useCategoryStore<T>(selector: (s: CategoryStore) => T): T {
  const ctx = useContext(CategoryStoreContext);
  if (!ctx) {
    throw new Error(
      "useCategoryStore must be used within CategoryStoreProvider",
    );
  }
  return useStore(ctx, selector);
}
