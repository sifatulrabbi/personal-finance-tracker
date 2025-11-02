import {
  pgTable,
  uuid,
  varchar,
  decimal,
  timestamp,
  text,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { accounts } from "./accounts";
import { categories } from "./categories";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "income",
  "expense",
  "transfer",
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("BDT"),
  date: timestamp("date").notNull().defaultNow(),
  description: varchar("description", { length: 500 }),
  notes: text("notes"),
  payee: varchar("payee", { length: 255 }), // Who you paid or received from
  reference: varchar("reference", { length: 255 }), // Invoice number, check number, etc.

  // For transfers
  toAccountId: uuid("to_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),

  // For recurring transactions
  recurringTransactionId: uuid("recurring_transaction_id").references(
    () => transactions.id,
    { onDelete: "set null" },
  ),

  // Receipt attachment
  receiptUrl: varchar("receipt_url", { length: 500 }),

  // Reconciliation
  isReconciled: varchar("is_reconciled", { length: 10 })
    .notNull()
    .default("false"),
  reconciledAt: timestamp("reconciled_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// For split transactions (one transaction split across multiple categories)
export const transactionSplits = pgTable("transaction_splits", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionSplit = typeof transactionSplits.$inferSelect;
export type NewTransactionSplit = typeof transactionSplits.$inferInsert;
