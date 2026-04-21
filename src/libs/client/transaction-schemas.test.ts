import { describe, expect, test } from "bun:test";

import {
  toCreateExpenseInput,
  toCreateIncomeInput,
  toCreateTransferInput,
  toUpdateTransactionInput,
  transactionFormSchema,
  type ExpenseFormValues,
  type IncomeFormValues,
  type TransferFormValues,
} from "./transaction-schemas";

function validExpense(
  overrides: Partial<ExpenseFormValues> = {},
): ExpenseFormValues {
  return {
    type: "expense",
    personId: "person-1",
    accountId: "acc-1",
    categoryRef: { kind: "existing", id: "cat-1" },
    amount: "1234.56",
    currencyCode: "BDT",
    transactionDate: "2026-04-18",
    description: "",
    ...overrides,
  };
}

function validIncome(
  overrides: Partial<IncomeFormValues> = {},
): IncomeFormValues {
  return {
    type: "income",
    personId: "person-1",
    accountId: "acc-1",
    categoryRef: { kind: "existing", id: "cat-1" },
    originRef: { kind: "existing", id: "origin-1" },
    amount: "5000",
    currencyCode: "BDT",
    transactionDate: "2026-04-18",
    description: "",
    ...overrides,
  };
}

function validTransfer(
  overrides: Partial<TransferFormValues> = {},
): TransferFormValues {
  return {
    type: "transfer",
    personId: "person-1",
    sourceAccountId: "acc-1",
    destinationAccountId: "acc-2",
    amount: "1000",
    currencyCode: "BDT",
    transactionDate: "2026-04-18",
    description: "",
    ...overrides,
  };
}

describe("transactionFormSchema", () => {
  describe("expense variant", () => {
    test("accepts a complete expense with existing category", () => {
      const result = transactionFormSchema.safeParse(validExpense());
      expect(result.success).toBe(true);
    });

    test("accepts a complete expense with a new category", () => {
      const result = transactionFormSchema.safeParse(
        validExpense({ categoryRef: { kind: "new", name: "Groceries" } }),
      );
      expect(result.success).toBe(true);
    });

    test("rejects null categoryRef", () => {
      const result = transactionFormSchema.safeParse(
        validExpense({ categoryRef: null }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("categoryRef"),
        );
        expect(issue?.message).toContain("category");
      }
    });

    test("rejects empty person/account", () => {
      const result = transactionFormSchema.safeParse(
        validExpense({ personId: "", accountId: "" }),
      );
      expect(result.success).toBe(false);
    });

    test("rejects non-positive amount", () => {
      const result = transactionFormSchema.safeParse(
        validExpense({ amount: "0" }),
      );
      expect(result.success).toBe(false);
    });

    test("rejects malformed amount", () => {
      const result = transactionFormSchema.safeParse(
        validExpense({ amount: "12.345" }),
      );
      expect(result.success).toBe(false);
    });

    test("rejects malformed date", () => {
      const result = transactionFormSchema.safeParse(
        validExpense({ transactionDate: "2026/04/18" }),
      );
      expect(result.success).toBe(false);
    });

    test("rejects blank new-category name", () => {
      const result = transactionFormSchema.safeParse(
        validExpense({ categoryRef: { kind: "new", name: "   " } }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("income variant", () => {
    test("accepts a complete income", () => {
      const result = transactionFormSchema.safeParse(validIncome());
      expect(result.success).toBe(true);
    });

    test("rejects null originRef", () => {
      const result = transactionFormSchema.safeParse(
        validIncome({ originRef: null }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("originRef"),
        );
        expect(issue?.message).toContain("origin");
      }
    });
  });

  describe("transfer variant", () => {
    test("accepts a complete transfer", () => {
      const result = transactionFormSchema.safeParse(validTransfer());
      expect(result.success).toBe(true);
    });

    test("rejects self-transfer", () => {
      const result = transactionFormSchema.safeParse(
        validTransfer({ destinationAccountId: "acc-1" }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes("destinationAccountId"),
        );
        expect(issue?.message).toContain("different");
      }
    });

    test("rejects non-BDT currency on transfer", () => {
      const result = transactionFormSchema.safeParse({
        ...validTransfer(),
        currencyCode: "USD",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("toCreateExpenseInput", () => {
  test("existing category → categoryId field", () => {
    const input = toCreateExpenseInput(validExpense());
    expect(input).toEqual({
      accountId: "acc-1",
      personId: "person-1",
      categoryId: "cat-1",
      amount: "1234.56",
      currency: "BDT",
      transactionDate: "2026-04-18",
      description: undefined,
    });
  });

  test("new category → categoryName field", () => {
    const input = toCreateExpenseInput(
      validExpense({
        categoryRef: { kind: "new", name: "Utilities" },
      }),
    );
    expect(input).toMatchObject({
      categoryName: "Utilities",
    });
    expect(input).not.toHaveProperty("categoryId");
  });

  test("trims description and drops empty", () => {
    const input = toCreateExpenseInput(validExpense({ description: "   " }));
    expect(input.description).toBeUndefined();

    const withText = toCreateExpenseInput(
      validExpense({ description: "  note  " }),
    );
    expect(withText.description).toBe("note");
  });
});

describe("toCreateIncomeInput", () => {
  test("produces both category and origin fields", () => {
    const input = toCreateIncomeInput(
      validIncome({
        categoryRef: { kind: "new", name: "Salary" },
        originRef: { kind: "existing", id: "origin-xyz" },
      }),
    );
    expect(input).toMatchObject({
      categoryName: "Salary",
      originId: "origin-xyz",
    });
  });
});

describe("toCreateTransferInput", () => {
  test("maps transfer form values to transfer input", () => {
    const input = toCreateTransferInput(validTransfer());
    expect(input).toEqual({
      sourceAccountId: "acc-1",
      destinationAccountId: "acc-2",
      personId: "person-1",
      amount: "1000",
      transactionDate: "2026-04-18",
      description: undefined,
    });
  });
});

describe("toUpdateTransactionInput", () => {
  test("builds a full update payload from expense values", () => {
    const input = toUpdateTransactionInput(
      validExpense({ description: "fuel" }),
    );
    expect(input).toEqual({
      accountId: "acc-1",
      personId: "person-1",
      amount: "1234.56",
      currency: "BDT",
      transactionDate: "2026-04-18",
      description: "fuel",
      categoryId: "cat-1",
    });
  });

  test("includes originId only for income", () => {
    const input = toUpdateTransactionInput(validIncome());
    expect(input.originId).toBe("origin-1");
  });

  test("skips categoryId/originId when refs are null", () => {
    const input = toUpdateTransactionInput(
      validIncome({ categoryRef: null, originRef: null }),
    );
    expect(input).not.toHaveProperty("categoryId");
    expect(input).not.toHaveProperty("originId");
  });
});
