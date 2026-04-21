import type { Transaction } from "@/stores/transaction-store";

import type {
  CategoryRefValue,
  ExpenseFormValues,
  IncomeFormValues,
  OriginRefValue,
  TransactionFormValues,
  TransactionType,
  TransferFormValues,
} from "./transaction-schemas";

/**
 * Returns the current UTC date formatted as `YYYY-MM-DD`. Matches the
 * backend's date-only field type.
 */
export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Produces default RHF values for an empty form of the given type. Callers
 * can pass `today` in tests for deterministic output.
 */
export function defaultValuesFor(
  type: TransactionType,
  options: { today?: string; defaultCurrencyCode?: string } = {},
): TransactionFormValues {
  const today = options.today ?? getTodayString();
  const defaultCurrencyCode = options.defaultCurrencyCode ?? "BDT";

  switch (type) {
    case "expense":
      return {
        type: "expense",
        personId: "",
        accountId: "",
        categoryRef: null,
        amount: "",
        currencyCode: defaultCurrencyCode,
        transactionDate: today,
        description: "",
      } satisfies ExpenseFormValues;
    case "income":
      return {
        type: "income",
        personId: "",
        accountId: "",
        categoryRef: null,
        originRef: null,
        amount: "",
        currencyCode: defaultCurrencyCode,
        transactionDate: today,
        description: "",
      } satisfies IncomeFormValues;
    case "transfer":
      return {
        type: "transfer",
        personId: "",
        sourceAccountId: "",
        destinationAccountId: "",
        amount: "",
        currencyCode: "BDT",
        transactionDate: today,
        description: "",
      } satisfies TransferFormValues;
  }
}

/**
 * Derives form values from an existing transaction for edit mode. Transfers
 * are not editable (the backend blocks that), so this intentionally handles
 * only expense and income.
 */
export function defaultValuesFromTransaction(
  transaction: Transaction,
): ExpenseFormValues | IncomeFormValues {
  const baseFields = {
    personId: transaction.personId,
    accountId: transaction.accountId,
    amount: (transaction.originalAmountMinor / 100).toFixed(2),
    currencyCode: transaction.originalCurrencyCode,
    transactionDate: transaction.transactionDate,
    description: transaction.description ?? "",
  };

  const categoryRef: CategoryRefValue | null = transaction.categoryId
    ? { kind: "existing", id: transaction.categoryId }
    : null;

  if (transaction.type === "expense") {
    return {
      type: "expense",
      ...baseFields,
      categoryRef,
    };
  }

  const originRef: OriginRefValue | null = transaction.originId
    ? { kind: "existing", id: transaction.originId }
    : null;

  return {
    type: "income",
    ...baseFields,
    categoryRef,
    originRef,
  };
}
