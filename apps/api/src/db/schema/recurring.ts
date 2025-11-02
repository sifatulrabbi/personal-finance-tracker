import {
  pgTable,
  uuid,
  varchar,
  decimal,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { accounts } from "./accounts";
import { categories } from "./categories";

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
]);

export const recurringTransactions = pgTable("recurring_transactions", {
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

  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("BDT"),

  frequency: recurringFrequencyEnum("frequency").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // null means indefinite
  nextOccurrence: timestamp("next_occurrence").notNull(),

  // Day of month for monthly/quarterly/yearly (1-31)
  dayOfMonth: integer("day_of_month"),

  // Day of week for weekly/biweekly (0-6, 0 = Sunday)
  dayOfWeek: integer("day_of_week"),

  isActive: varchar("is_active", { length: 10 }).notNull().default("true"),
  autoCreate: varchar("auto_create", { length: 10 }).notNull().default("false"), // Auto-create transactions

  lastCreated: timestamp("last_created"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert;
