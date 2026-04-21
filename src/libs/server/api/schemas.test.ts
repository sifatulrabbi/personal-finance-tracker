import { describe, expect, test } from "bun:test";

import {
  createAccountSchema,
  createCategorySchema,
  createExpenseSchema,
  createIncomeSchema,
  createOriginSchema,
  createPersonSchema,
  createTransferSchema,
  inviteUserSchema,
  updateAccountSchema,
} from "./schemas";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const VALID_UUID_2 = "00000000-0000-4000-8000-000000000002";
const VALID_DATE = "2026-04-01";

describe("createPersonSchema", () => {
  test("accepts valid name", () => {
    const result = createPersonSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(true);
  });

  test("rejects empty name", () => {
    const result = createPersonSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("inviteUserSchema", () => {
  test("accepts valid email", () => {
    const result = inviteUserSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  test("rejects invalid email", () => {
    const result = inviteUserSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("createAccountSchema", () => {
  test("accepts valid input", () => {
    const result = createAccountSchema.safeParse({
      name: "Savings",
      initialBalance: "100.00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.initialBalance).toBe(10000);
    }
  });

  test("rejects missing name", () => {
    const result = createAccountSchema.safeParse({ initialBalance: "50.00" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid balance", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      initialBalance: "abc",
    });
    expect(result.success).toBe(false);
  });

  test("accepts optional description", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      description: "My account",
      initialBalance: 50,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateAccountSchema", () => {
  test("accepts partial update with name only", () => {
    const result = updateAccountSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  test("accepts empty object", () => {
    const result = updateAccountSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("createCategorySchema", () => {
  test("accepts valid name", () => {
    const result = createCategorySchema.safeParse({ name: "Groceries" });
    expect(result.success).toBe(true);
  });

  test("rejects empty name", () => {
    const result = createCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("createOriginSchema", () => {
  test("accepts valid name", () => {
    const result = createOriginSchema.safeParse({ name: "Acme Corp" });
    expect(result.success).toBe(true);
  });

  test("rejects empty name", () => {
    const result = createOriginSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("createExpenseSchema", () => {
  const base = {
    accountId: VALID_UUID,
    personId: VALID_UUID,
    amount: "25.50",
    transactionDate: VALID_DATE,
  };

  test("accepts with categoryId", () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      categoryId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test("accepts with categoryName", () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      categoryName: "Groceries",
    });
    expect(result.success).toBe(true);
  });

  test("rejects when both categoryId and categoryName provided", () => {
    const result = createExpenseSchema.safeParse({
      ...base,
      categoryId: VALID_UUID,
      categoryName: "Groceries",
    });
    expect(result.success).toBe(false);
  });

  test("rejects when neither categoryId nor categoryName provided", () => {
    const result = createExpenseSchema.safeParse(base);
    expect(result.success).toBe(false);
  });
});

describe("createIncomeSchema", () => {
  const base = {
    accountId: VALID_UUID,
    personId: VALID_UUID,
    amount: "100.00",
    transactionDate: VALID_DATE,
  };

  test("accepts with categoryId and originId", () => {
    const result = createIncomeSchema.safeParse({
      ...base,
      categoryId: VALID_UUID,
      originId: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  test("accepts with categoryName and originName", () => {
    const result = createIncomeSchema.safeParse({
      ...base,
      categoryName: "Salary",
      originName: "Acme Corp",
    });
    expect(result.success).toBe(true);
  });

  test("rejects when both originId and originName provided", () => {
    const result = createIncomeSchema.safeParse({
      ...base,
      categoryId: VALID_UUID,
      originId: VALID_UUID_2,
      originName: "Acme",
    });
    expect(result.success).toBe(false);
  });

  test("rejects when neither originId nor originName provided", () => {
    const result = createIncomeSchema.safeParse({
      ...base,
      categoryId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  test("rejects when neither categoryId nor categoryName provided", () => {
    const result = createIncomeSchema.safeParse({
      ...base,
      originId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

describe("createTransferSchema", () => {
  const base = {
    sourceAccountId: VALID_UUID,
    destinationAccountId: VALID_UUID_2,
    personId: VALID_UUID,
    amount: "50.00",
    transactionDate: VALID_DATE,
  };

  test("accepts valid transfer", () => {
    const result = createTransferSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  test("rejects when source equals destination", () => {
    const result = createTransferSchema.safeParse({
      ...base,
      destinationAccountId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid UUID for sourceAccountId", () => {
    const result = createTransferSchema.safeParse({
      ...base,
      sourceAccountId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
