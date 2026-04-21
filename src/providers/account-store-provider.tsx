"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { createAccountStore, type AccountStore } from "@/stores/account-store";

type AccountStoreApi = ReturnType<typeof createAccountStore>;

const AccountStoreContext = createContext<AccountStoreApi | undefined>(
  undefined,
);

export function AccountStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAccountStore());
  return (
    <AccountStoreContext.Provider value={store}>
      {children}
    </AccountStoreContext.Provider>
  );
}

export function useAccountStore<T>(selector: (s: AccountStore) => T): T {
  const ctx = useContext(AccountStoreContext);
  if (!ctx) {
    throw new Error("useAccountStore must be used within AccountStoreProvider");
  }
  return useStore(ctx, selector);
}
