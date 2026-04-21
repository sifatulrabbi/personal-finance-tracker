"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import {
  createTransactionStore,
  type TransactionStore,
} from "@/stores/transaction-store";

type TransactionStoreApi = ReturnType<typeof createTransactionStore>;

const TransactionStoreContext = createContext<TransactionStoreApi | undefined>(
  undefined,
);

export function TransactionStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [store] = useState(() => createTransactionStore());
  return (
    <TransactionStoreContext.Provider value={store}>
      {children}
    </TransactionStoreContext.Provider>
  );
}

export function useTransactionStore<T>(
  selector: (s: TransactionStore) => T,
): T {
  const ctx = useContext(TransactionStoreContext);
  if (!ctx) {
    throw new Error(
      "useTransactionStore must be used within TransactionStoreProvider",
    );
  }
  return useStore(ctx, selector);
}
