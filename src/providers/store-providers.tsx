"use client";

import type { ReactNode } from "react";

import { AccountStoreProvider } from "@/providers/account-store-provider";
import { CategoryStoreProvider } from "@/providers/category-store-provider";
import { CurrencyStoreProvider } from "@/providers/currency-store-provider";
import { OriginStoreProvider } from "@/providers/origin-store-provider";
import { PersonStoreProvider } from "@/providers/person-store-provider";
import { TransactionStoreProvider } from "@/providers/transaction-store-provider";

export function StoreProviders({ children }: { children: ReactNode }) {
  return (
    <CurrencyStoreProvider>
      <AccountStoreProvider>
        <PersonStoreProvider>
          <CategoryStoreProvider>
            <OriginStoreProvider>
              <TransactionStoreProvider>{children}</TransactionStoreProvider>
            </OriginStoreProvider>
          </CategoryStoreProvider>
        </PersonStoreProvider>
      </AccountStoreProvider>
    </CurrencyStoreProvider>
  );
}
