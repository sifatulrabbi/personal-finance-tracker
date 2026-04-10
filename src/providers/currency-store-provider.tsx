"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import {
  createCurrencyStore,
  type CurrencyStore,
} from "@/stores/currency-store";

type CurrencyStoreApi = ReturnType<typeof createCurrencyStore>;

const CurrencyStoreContext = createContext<CurrencyStoreApi | undefined>(
  undefined,
);

export function CurrencyStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createCurrencyStore());
  return (
    <CurrencyStoreContext.Provider value={store}>
      {children}
    </CurrencyStoreContext.Provider>
  );
}

export function useCurrencyStore<T>(selector: (s: CurrencyStore) => T): T {
  const ctx = useContext(CurrencyStoreContext);
  if (!ctx) {
    throw new Error(
      "useCurrencyStore must be used within CurrencyStoreProvider",
    );
  }
  return useStore(ctx, selector);
}
