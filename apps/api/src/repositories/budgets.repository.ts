import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/connection";
import {
  budgets,
  transactions,
  exchangeRates,
  type Budget,
  type NewBudget,
} from "../db/schema";

export class BudgetsRepository {
  /**
   * Get all budgets for a user
   */
  static async findByUserId(userId: string): Promise<Budget[]> {
    return await db
      .select()
      .from(budgets)
      .where(eq(budgets.userId, userId))
      .orderBy(desc(budgets.createdAt));
  }

  /**
   * Get budget by ID
   */
  static async findById(id: string, userId: string): Promise<Budget | null> {
    const [budget] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
      .limit(1);

    return budget || null;
  }

  /**
   * Create new budget
   */
  static async create(data: NewBudget): Promise<Budget> {
    const [budget] = await db.insert(budgets).values(data).returning();
    return budget;
  }

  /**
   * Update budget
   */
  static async update(
    id: string,
    userId: string,
    data: Partial<NewBudget>,
  ): Promise<Budget | null> {
    const [budget] = await db
      .update(budgets)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
      .returning();

    return budget || null;
  }

  /**
   * Delete budget
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
      .returning();

    return result.length > 0;
  }

  /**
   * Calculate end date based on budget period if not provided
   */
  private static calculateEndDate(startDate: Date, period: string): Date {
    const start = new Date(startDate);

    switch (period) {
      case "weekly":
        start.setDate(start.getDate() + 7);
        break;
      case "monthly":
        start.setMonth(start.getMonth() + 1);
        break;
      case "yearly":
        start.setFullYear(start.getFullYear() + 1);
        break;
    }

    return start;
  }

  /**
   * Get budget with spending comparison (converted to BDT)
   */
  static async getBudgetWithSpending(
    id: string,
    userId: string,
  ): Promise<{
    budget: Budget;
    spent: string;
    remaining: string;
    percentage: number;
  } | null> {
    const budget = await this.findById(id, userId);
    if (!budget) return null;

    // Calculate effective end date if not provided
    const effectiveEndDate = budget.endDate
      ? budget.endDate
      : this.calculateEndDate(budget.startDate, budget.period);

    // Build query conditions
    const conditions = [
      eq(transactions.userId, userId),
      eq(transactions.type, "expense"),
      gte(transactions.date, budget.startDate),
      lte(transactions.date, effectiveEndDate),
    ];

    // If categoryId is null, track ALL expenses; otherwise track specific category
    if (budget.categoryId) {
      conditions.push(eq(transactions.categoryId, budget.categoryId));
    }

    // Get transactions for the budget period and category (or all categories)
    const budgetTransactions = await db
      .select({
        amount: transactions.amount,
        currency: transactions.currency,
      })
      .from(transactions)
      .where(and(...conditions));

    // Get exchange rates to BDT
    const rates = await db
      .select({
        fromCurrency: exchangeRates.fromCurrency,
        rate: exchangeRates.rate,
      })
      .from(exchangeRates)
      .where(eq(exchangeRates.toCurrency, "BDT"));

    const exchangeRateMap = new Map<string, number>();
    for (const rate of rates) {
      exchangeRateMap.set(rate.fromCurrency, parseFloat(rate.rate));
    }

    // Calculate total spent in BDT
    let totalSpent = 0;
    for (const transaction of budgetTransactions) {
      const amount = parseFloat(transaction.amount);
      const rate = exchangeRateMap.get(transaction.currency) || 1;
      totalSpent += amount * rate;
    }

    // Convert budget amount to BDT if needed
    const budgetRate = exchangeRateMap.get(budget.currency) || 1;
    const budgetAmountInBDT = parseFloat(budget.amount) * budgetRate;

    const remaining = budgetAmountInBDT - totalSpent;
    const percentage =
      budgetAmountInBDT > 0 ? (totalSpent / budgetAmountInBDT) * 100 : 0;

    return {
      budget,
      spent: totalSpent.toFixed(4),
      remaining: remaining.toFixed(4),
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  /**
   * Get all budgets with spending for a user
   */
  static async getAllWithSpending(userId: string): Promise<
    Array<{
      budget: Budget;
      spent: string;
      remaining: string;
      percentage: number;
    }>
  > {
    const userBudgets = await this.findByUserId(userId);
    const results = [];

    for (const budget of userBudgets) {
      const budgetWithSpending = await this.getBudgetWithSpending(
        budget.id,
        userId,
      );
      if (budgetWithSpending) {
        results.push(budgetWithSpending);
      }
    }

    return results;
  }
}
