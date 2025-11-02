import {
  pgTable,
  uuid,
  varchar,
  decimal,
  timestamp,
  text,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { accounts } from "./accounts";

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  targetAmount: decimal("target_amount", { precision: 19, scale: 4 }).notNull(),
  currentAmount: decimal("current_amount", { precision: 19, scale: 4 })
    .notNull()
    .default("0"),
  currency: varchar("currency", { length: 3 }).notNull().default("BDT"),
  targetDate: timestamp("target_date"),
  color: varchar("color", { length: 7 }).default("#10b981"),
  icon: varchar("icon", { length: 50 }),
  isCompleted: varchar("is_completed", { length: 10 })
    .notNull()
    .default("false"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
