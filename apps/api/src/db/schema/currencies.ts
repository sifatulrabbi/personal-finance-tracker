import { pgTable, varchar, decimal, timestamp } from "drizzle-orm/pg-core";

export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(), // ISO 4217 code (USD, EUR, etc.)
  name: varchar("name", { length: 255 }).notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  decimalPlaces: varchar("decimal_places", { length: 10 })
    .notNull()
    .default("2"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Exchange rates table for currency conversion
export const exchangeRates = pgTable("exchange_rates", {
  fromCurrency: varchar("from_currency", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  toCurrency: varchar("to_currency", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  rate: decimal("rate", { precision: 19, scale: 8 }).notNull(),
  date: timestamp("date").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
