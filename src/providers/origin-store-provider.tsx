"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { createOriginStore, type OriginStore } from "@/stores/origin-store";

type OriginStoreApi = ReturnType<typeof createOriginStore>;

const OriginStoreContext = createContext<OriginStoreApi | undefined>(undefined);

export function OriginStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createOriginStore());
  return (
    <OriginStoreContext.Provider value={store}>
      {children}
    </OriginStoreContext.Provider>
  );
}

export function useOriginStore<T>(selector: (s: OriginStore) => T): T {
  const ctx = useContext(OriginStoreContext);
  if (!ctx) {
    throw new Error("useOriginStore must be used within OriginStoreProvider");
  }
  return useStore(ctx, selector);
}
