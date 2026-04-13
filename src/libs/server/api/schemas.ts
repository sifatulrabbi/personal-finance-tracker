import { z } from "zod";

import {
  currencyCodeSchema,
  dateOnlyStringSchema,
  moneyInputSchema,
  uuidStringSchema,
} from "@/libs/server/api/validation";

// ── People ──────────────────────────────────────────────────────────────────

export const createPersonSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
});

// ── Users / Invites ─────────────────────────────────────────────────────────

export const inviteUserSchema = z.object({
  email: z.email("Must be a valid email address."),
});

// ── Accounts ────────────────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().trim().optional(),
  initialBalance: moneyInputSchema,
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").optional(),
  description: z.string().trim().optional(),
});

// ── Categories ──────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().trim().optional(),
});

// ── Origins ─────────────────────────────────────────────────────────────────

export const createOriginSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  description: z.string().trim().optional(),
});

// ── Expenses ────────────────────────────────────────────────────────────────

export const createExpenseSchema = z
  .object({
    accountId: uuidStringSchema,
    personId: uuidStringSchema,
    categoryId: uuidStringSchema.optional(),
    categoryName: z.string().trim().min(1).optional(),
    amount: moneyInputSchema,
    currency: currencyCodeSchema.optional().default("BDT"),
    description: z.string().trim().optional(),
    transactionDate: dateOnlyStringSchema,
  })
  .refine((data) => data.categoryId || data.categoryName, {
    message: "Either categoryId or categoryName is required.",
    path: ["categoryId"],
  })
  .refine((data) => !(data.categoryId && data.categoryName), {
    message: "Provide categoryId or categoryName, not both.",
    path: ["categoryId"],
  });

// ── Income ──────────────────────────────────────────────────────────────────

export const createIncomeSchema = z
  .object({
    accountId: uuidStringSchema,
    personId: uuidStringSchema,
    categoryId: uuidStringSchema.optional(),
    categoryName: z.string().trim().min(1).optional(),
    originId: uuidStringSchema.optional(),
    originName: z.string().trim().min(1).optional(),
    amount: moneyInputSchema,
    currency: currencyCodeSchema.optional().default("BDT"),
    description: z.string().trim().optional(),
    transactionDate: dateOnlyStringSchema,
  })
  .refine((data) => data.categoryId || data.categoryName, {
    message: "Either categoryId or categoryName is required.",
    path: ["categoryId"],
  })
  .refine((data) => !(data.categoryId && data.categoryName), {
    message: "Provide categoryId or categoryName, not both.",
    path: ["categoryId"],
  })
  .refine((data) => data.originId || data.originName, {
    message: "Either originId or originName is required.",
    path: ["originId"],
  })
  .refine((data) => !(data.originId && data.originName), {
    message: "Provide originId or originName, not both.",
    path: ["originId"],
  });

// ── Transfers ───────────────────────────────────────────────────────────────

// ── Currencies ─────────────────────────────────────────────────────────────

export const createCurrencySchema = z.object({
  code: currencyCodeSchema,
  symbol: z.string().trim().min(1).max(5),
  name: z.string().trim().min(1),
  rateToBdt: moneyInputSchema,
});

export const updateCurrencySchema = z.object({
  symbol: z.string().trim().min(1).max(5).optional(),
  name: z.string().trim().min(1).optional(),
  rateToBdt: moneyInputSchema.optional(),
});

// ── Transaction Update ─────────────────────────────────────────────────────

export const updateTransactionSchema = z
  .object({
    accountId: uuidStringSchema.optional(),
    personId: uuidStringSchema.optional(),
    categoryId: uuidStringSchema.optional(),
    categoryName: z.string().trim().min(1).optional(),
    originId: uuidStringSchema.optional(),
    originName: z.string().trim().min(1).optional(),
    amount: moneyInputSchema.optional(),
    currency: currencyCodeSchema.optional(),
    description: z.string().trim().optional(),
    transactionDate: dateOnlyStringSchema.optional(),
  })
  .refine((data) => !(data.categoryId && data.categoryName), {
    message: "Provide categoryId or categoryName, not both.",
    path: ["categoryId"],
  })
  .refine((data) => !(data.originId && data.originName), {
    message: "Provide originId or originName, not both.",
    path: ["originId"],
  });

// ── Transfers ───────────────────────────────────────────────────────────────

export const createTransferSchema = z
  .object({
    sourceAccountId: uuidStringSchema,
    destinationAccountId: uuidStringSchema,
    personId: uuidStringSchema,
    amount: moneyInputSchema,
    description: z.string().trim().optional(),
    transactionDate: dateOnlyStringSchema,
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: "Source and destination accounts must be different.",
    path: ["destinationAccountId"],
  });
