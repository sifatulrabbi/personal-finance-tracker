"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { createPersonStore, type PersonStore } from "@/stores/person-store";

type PersonStoreApi = ReturnType<typeof createPersonStore>;

const PersonStoreContext = createContext<PersonStoreApi | undefined>(undefined);

export function PersonStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createPersonStore());
  return (
    <PersonStoreContext.Provider value={store}>
      {children}
    </PersonStoreContext.Provider>
  );
}

export function usePersonStore<T>(selector: (s: PersonStore) => T): T {
  const ctx = useContext(PersonStoreContext);
  if (!ctx) {
    throw new Error("usePersonStore must be used within PersonStoreProvider");
  }
  return useStore(ctx, selector);
}
