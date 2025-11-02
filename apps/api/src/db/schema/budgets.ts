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
import { categories } from "./categories";

export const budgetPeriodEnum = pgEnum("budget_period", [
  "weekly",
  "monthly",
  "yearly",
]);

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "cascade",
  }), // Nullable to allow "All Categories" budgets
  name: varchar("name", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
  period: budgetPeriodEnum("period").notNull().default("monthly"),
  currency: varchar("currency", { length: 3 }).notNull().default("BDT"),

  // Period specifics
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),

  // Rollover settings
  allowRollover: varchar("allow_rollover", { length: 10 })
    .notNull()
    .default("false"),

  // Alerts
  alertEnabled: varchar("alert_enabled", { length: 10 })
    .notNull()
    .default("true"),
  alertThreshold: integer("alert_threshold").default(80), // Percentage (e.g., 80%)

  isActive: varchar("is_active", { length: 10 }).notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
