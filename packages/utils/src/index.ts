import type { Transaction } from "@finance-tracker/types";

/**
 * Format a number as currency
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Format a date to a readable string
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/**
 * Calculate total amount from transactions
 */
export function calculateTotal(transactions: Transaction[]): number {
  return transactions.reduce((total, transaction) => {
    const amount =
      transaction.type === "income" ? transaction.amount : -transaction.amount;
    return total + amount;
  }, 0);
}

/**
 * Group transactions by category
 */
export function groupByCategory(
  transactions: Transaction[],
): Record<string, Transaction[]> {
  return transactions.reduce(
    (groups, transaction) => {
      const category = transaction.category;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(transaction);
      return groups;
    },
    {} as Record<string, Transaction[]>,
  );
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
