import { z } from "zod";

import type {
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  UpdateTransactionInput,
} from "@/stores/transaction-store";

/**
 * Client-side transaction form schemas.
 *
 * The form models a transaction as a discriminated union on `type`. Each
 * variant requires a distinct set of fields. Category/origin are represented
 * as a `{ kind, id | name }` structured value so "pick existing" vs "create
 * new" never drift out of sync. Amount stays as a user-entered string —
 * the backend converts it to minor units via its own money schema.
 */

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const transactionTypes = ["expense", "income", "transfer"] as const;
export type TransactionType = (typeof transactionTypes)[number];

// ── Category / origin reference ─────────────────────────────────────────────

export const categoryRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    id: z.string().min(1, "Select a category"),
  }),
  z.object({
    kind: z.literal("new"),
    name: z.string().trim().min(1, "Category name is required"),
  }),
]);

export const originRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    id: z.string().min(1, "Select an origin"),
  }),
  z.object({
    kind: z.literal("new"),
    name: z.string().trim().min(1, "Origin name is required"),
  }),
]);

export type CategoryRefValue = z.infer<typeof categoryRefSchema>;
export type OriginRefValue = z.infer<typeof originRefSchema>;

// ── Reusable field schemas ──────────────────────────────────────────────────

const amountSchema = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, "Enter a valid amount (up to 2 decimals)")
  .refine(
    (value) => Number.parseFloat(value) > 0,
    "Amount must be greater than zero",
  );

const dateSchema = z
  .string()
  .trim()
  .regex(DATE_PATTERN, "Enter a valid date (YYYY-MM-DD)");

const personIdSchema = z.string().min(1, "Select a person");
const accountIdSchema = z.string().min(1, "Select an account");
const descriptionSchema = z.string().max(500).optional();
const currencyCodeSchema = z.string().trim().length(3, "Select a currency");

// ── Variants ────────────────────────────────────────────────────────────────

const expenseVariant = z.object({
  type: z.literal("expense"),
  personId: personIdSchema,
  accountId: accountIdSchema,
  categoryRef: categoryRefSchema.nullable(),
  amount: amountSchema,
  currencyCode: currencyCodeSchema,
  transactionDate: dateSchema,
  description: descriptionSchema,
});

const incomeVariant = z.object({
  type: z.literal("income"),
  personId: personIdSchema,
  accountId: accountIdSchema,
  categoryRef: categoryRefSchema.nullable(),
  originRef: originRefSchema.nullable(),
  amount: amountSchema,
  currencyCode: currencyCodeSchema,
  transactionDate: dateSchema,
  description: descriptionSchema,
});

const transferVariant = z.object({
  type: z.literal("transfer"),
  personId: personIdSchema,
  sourceAccountId: accountIdSchema,
  destinationAccountId: accountIdSchema,
  amount: amountSchema,
  // Transfers are always BDT; schema enforces that.
  currencyCode: z.literal("BDT"),
  transactionDate: dateSchema,
  description: descriptionSchema,
});

// ── The form schema ─────────────────────────────────────────────────────────

export const transactionFormSchema = z
  .discriminatedUnion("type", [expenseVariant, incomeVariant, transferVariant])
  .superRefine((val, ctx) => {
    if (val.type === "expense" || val.type === "income") {
      if (val.categoryRef === null) {
        ctx.addIssue({
          code: "custom",
          message: "Select or create a category",
          path: ["categoryRef"],
        });
      }
    }
    if (val.type === "income") {
      if (val.originRef === null) {
        ctx.addIssue({
          code: "custom",
          message: "Select or create an origin",
          path: ["originRef"],
        });
      }
    }
    if (val.type === "transfer") {
      if (
        val.sourceAccountId !== "" &&
        val.sourceAccountId === val.destinationAccountId
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Source and destination must be different accounts",
          path: ["destinationAccountId"],
        });
      }
    }
  });

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
export type ExpenseFormValues = Extract<
  TransactionFormValues,
  { type: "expense" }
>;
export type IncomeFormValues = Extract<
  TransactionFormValues,
  { type: "income" }
>;
export type TransferFormValues = Extract<
  TransactionFormValues,
  { type: "transfer" }
>;

// ── Mappers: form values → API inputs ───────────────────────────────────────

function categoryFieldsFromRef(
  ref: CategoryRefValue,
): { categoryId: string } | { categoryName: string } {
  return ref.kind === "existing"
    ? { categoryId: ref.id }
    : { categoryName: ref.name };
}

function originFieldsFromRef(
  ref: OriginRefValue,
): { originId: string } | { originName: string } {
  return ref.kind === "existing"
    ? { originId: ref.id }
    : { originName: ref.name };
}

function normalizeDescription(
  description: string | undefined,
): string | undefined {
  const trimmed = description?.trim();
  return trimmed ? trimmed : undefined;
}

export function toCreateExpenseInput(
  values: ExpenseFormValues,
): CreateExpenseInput {
  if (values.categoryRef === null) {
    throw new Error("categoryRef is required for expense submission");
  }
  return {
    accountId: values.accountId,
    personId: values.personId,
    amount: values.amount,
    currency: values.currencyCode,
    transactionDate: values.transactionDate,
    description: normalizeDescription(values.description),
    ...categoryFieldsFromRef(values.categoryRef),
  };
}

export function toCreateIncomeInput(
  values: IncomeFormValues,
): CreateIncomeInput {
  if (values.categoryRef === null || values.originRef === null) {
    throw new Error(
      "categoryRef and originRef are required for income submission",
    );
  }
  return {
    accountId: values.accountId,
    personId: values.personId,
    amount: values.amount,
    currency: values.currencyCode,
    transactionDate: values.transactionDate,
    description: normalizeDescription(values.description),
    ...categoryFieldsFromRef(values.categoryRef),
    ...originFieldsFromRef(values.originRef),
  };
}

export function toCreateTransferInput(
  values: TransferFormValues,
): CreateTransferInput {
  return {
    sourceAccountId: values.sourceAccountId,
    destinationAccountId: values.destinationAccountId,
    personId: values.personId,
    amount: values.amount,
    transactionDate: values.transactionDate,
    description: normalizeDescription(values.description),
  };
}

/**
 * Update mapper — non-transfer only. Backend does not permit editing transfers
 * (delete + recreate instead), so the UI never calls this with transfer values.
 */
export function toUpdateTransactionInput(
  values: ExpenseFormValues | IncomeFormValues,
): UpdateTransactionInput {
  const base: UpdateTransactionInput = {
    accountId: values.accountId,
    personId: values.personId,
    amount: values.amount,
    currency: values.currencyCode,
    transactionDate: values.transactionDate,
    description: normalizeDescription(values.description),
  };
  if (values.categoryRef !== null) {
    Object.assign(base, categoryFieldsFromRef(values.categoryRef));
  }
  if (values.type === "income" && values.originRef !== null) {
    Object.assign(base, originFieldsFromRef(values.originRef));
  }
  return base;
}
