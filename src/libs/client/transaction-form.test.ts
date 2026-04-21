import { describe, expect, test } from "bun:test";

import type { Transaction } from "@/stores/transaction-store";

import {
  defaultValuesFor,
  defaultValuesFromTransaction,
  getTodayString,
} from "./transaction-form";

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    householdId: "h-1",
    accountId: "acc-1",
    personId: "p-1",
    categoryId: "cat-1",
    originId: null,
    createdByUserId: "u-1",
    type: "expense",
    amountMinor: 150000,
    originalCurrencyCode: "BDT",
    originalAmountMinor: 150000,
    exchangeRateToBdtMinor: 100,
    description: "Groceries run",
    transactionDate: "2026-04-18",
    transferGroupId: null,
    createdAt: "2026-04-18T00:00:00Z",
    updatedAt: "2026-04-18T00:00:00Z",
    account: { id: "acc-1", name: "Cash" },
    person: { id: "p-1", name: "Alex" },
    category: { id: "cat-1", name: "Groceries" },
    origin: null,
    ...overrides,
  };
}

describe("getTodayString", () => {
  test("returns a YYYY-MM-DD string", () => {
    expect(getTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("defaultValuesFor", () => {
  test("expense defaults have no category/origin and empty money fields", () => {
    const values = defaultValuesFor("expense", { today: "2026-04-18" });
    expect(values).toEqual({
      type: "expense",
      personId: "",
      accountId: "",
      categoryRef: null,
      amount: "",
      currencyCode: "BDT",
      transactionDate: "2026-04-18",
      description: "",
    });
  });

  test("income defaults include null originRef", () => {
    const values = defaultValuesFor("income", { today: "2026-04-18" });
    expect(values).toMatchObject({
      type: "income",
      categoryRef: null,
      originRef: null,
    });
  });

  test("transfer defaults have both account slots and BDT currency", () => {
    const values = defaultValuesFor("transfer", { today: "2026-04-18" });
    expect(values).toEqual({
      type: "transfer",
      personId: "",
      sourceAccountId: "",
      destinationAccountId: "",
      amount: "",
      currencyCode: "BDT",
      transactionDate: "2026-04-18",
      description: "",
    });
  });

  test("respects a custom default currency for expense", () => {
    const values = defaultValuesFor("expense", {
      today: "2026-04-18",
      defaultCurrencyCode: "USD",
    });
    expect(values.currencyCode).toBe("USD");
  });

  test("transfer always uses BDT even if a default is passed", () => {
    const values = defaultValuesFor("transfer", {
      today: "2026-04-18",
      defaultCurrencyCode: "USD",
    });
    expect(values.currencyCode).toBe("BDT");
  });
});

describe("defaultValuesFromTransaction", () => {
  test("maps an expense transaction to form values", () => {
    const values = defaultValuesFromTransaction(makeTransaction());
    expect(values).toEqual({
      type: "expense",
      personId: "p-1",
      accountId: "acc-1",
      categoryRef: { kind: "existing", id: "cat-1" },
      amount: "1500.00",
      currencyCode: "BDT",
      transactionDate: "2026-04-18",
      description: "Groceries run",
    });
  });

  test("maps an income transaction including originRef", () => {
    const values = defaultValuesFromTransaction(
      makeTransaction({
        type: "income",
        originId: "org-1",
        origin: { id: "org-1", name: "Paycheck" },
      }),
    );
    expect(values).toEqual({
      type: "income",
      personId: "p-1",
      accountId: "acc-1",
      categoryRef: { kind: "existing", id: "cat-1" },
      originRef: { kind: "existing", id: "org-1" },
      amount: "1500.00",
      currencyCode: "BDT",
      transactionDate: "2026-04-18",
      description: "Groceries run",
    });
  });

  test("null categoryId becomes null categoryRef", () => {
    const values = defaultValuesFromTransaction(
      makeTransaction({ categoryId: null, category: null }),
    );
    expect(values.categoryRef).toBeNull();
  });

  test("handles a null description", () => {
    const values = defaultValuesFromTransaction(
      makeTransaction({ description: null }),
    );
    expect(values.description).toBe("");
  });

  test("formats amount in major units with two decimals", () => {
    const values = defaultValuesFromTransaction(
      makeTransaction({ originalAmountMinor: 9999 }),
    );
    expect(values.amount).toBe("99.99");
  });
});
