import { eq, and, desc, gte, lte, sql, isNull } from "drizzle-orm";
import { db } from "../db/connection";
import {
  transactions,
  transactionSplits,
  type Transaction,
  type NewTransaction,
  type TransactionSplit,
  type NewTransactionSplit,
} from "../db/schema";
import { AccountsRepository } from "./accounts.repository";

export class TransactionsRepository {
  /**
   * Get all transactions for a user
   */
  static async findByUserId(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      accountId?: string;
      categoryId?: string;
      type?: "income" | "expense" | "transfer";
    },
  ): Promise<Transaction[]> {
    let query = db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId));

    // Apply filters
    const conditions = [eq(transactions.userId, userId)];

    if (options?.startDate) {
      conditions.push(gte(transactions.date, options.startDate));
    }

    if (options?.endDate) {
      conditions.push(lte(transactions.date, options.endDate));
    }

    if (options?.accountId) {
      conditions.push(eq(transactions.accountId, options.accountId));
    }

    if (options?.categoryId) {
      conditions.push(eq(transactions.categoryId, options.categoryId));
    }

    if (options?.type) {
      conditions.push(eq(transactions.type, options.type));
    }

    const result = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    return result;
  }

  /**
   * Get transaction by ID
   */
  static async findById(
    id: string,
    userId: string,
  ): Promise<Transaction | null> {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .limit(1);

    return transaction || null;
  }

  /**
   * Create new transaction
   */
  static async create(data: NewTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(data)
      .returning();

    // Update account balance
    if (transaction.type === "income") {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "add",
      );
    } else if (transaction.type === "expense") {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "subtract",
      );
    } else if (transaction.type === "transfer" && transaction.toAccountId) {
      // For transfers, subtract from source and add to destination
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "subtract",
      );
      await this.updateAccountBalance(
        transaction.toAccountId,
        parseFloat(transaction.amount),
        "add",
      );
    }

    return transaction;
  }

  /**
   * Update transaction
   */
  static async update(
    id: string,
    userId: string,
    data: Partial<NewTransaction>,
  ): Promise<Transaction | null> {
    // Get old transaction to reverse balance changes
    const oldTransaction = await this.findById(id, userId);
    if (!oldTransaction) return null;

    // Reverse old balance changes
    if (oldTransaction.type === "income") {
      await this.updateAccountBalance(
        oldTransaction.accountId,
        parseFloat(oldTransaction.amount),
        "subtract",
      );
    } else if (oldTransaction.type === "expense") {
      await this.updateAccountBalance(
        oldTransaction.accountId,
        parseFloat(oldTransaction.amount),
        "add",
      );
    } else if (
      oldTransaction.type === "transfer" &&
      oldTransaction.toAccountId
    ) {
      await this.updateAccountBalance(
        oldTransaction.accountId,
        parseFloat(oldTransaction.amount),
        "add",
      );
      await this.updateAccountBalance(
        oldTransaction.toAccountId,
        parseFloat(oldTransaction.amount),
        "subtract",
      );
    }

    // Update transaction
    const [transaction] = await db
      .update(transactions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();

    // Apply new balance changes
    if (transaction.type === "income") {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "add",
      );
    } else if (transaction.type === "expense") {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "subtract",
      );
    } else if (transaction.type === "transfer" && transaction.toAccountId) {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "subtract",
      );
      await this.updateAccountBalance(
        transaction.toAccountId,
        parseFloat(transaction.amount),
        "add",
      );
    }

    return transaction || null;
  }

  /**
   * Delete transaction
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const transaction = await this.findById(id, userId);
    if (!transaction) return false;

    // Reverse balance changes
    if (transaction.type === "income") {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "subtract",
      );
    } else if (transaction.type === "expense") {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "add",
      );
    } else if (transaction.type === "transfer" && transaction.toAccountId) {
      await this.updateAccountBalance(
        transaction.accountId,
        parseFloat(transaction.amount),
        "add",
      );
      await this.updateAccountBalance(
        transaction.toAccountId,
        parseFloat(transaction.amount),
        "subtract",
      );
    }

    const result = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();

    return result.length > 0;
  }

  /**
   * Get transaction splits
   */
  static async getSplits(transactionId: string): Promise<TransactionSplit[]> {
    return await db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, transactionId));
  }

  /**
   * Create transaction split
   */
  static async createSplit(
    data: NewTransactionSplit,
  ): Promise<TransactionSplit> {
    const [split] = await db.insert(transactionSplits).values(data).returning();
    return split;
  }

  /**
   * Update account balance helper
   */
  private static async updateAccountBalance(
    accountId: string,
    amount: number,
    operation: "add" | "subtract",
  ): Promise<void> {
    const account = await db.query.accounts.findFirst({
      where: eq(transactions.accountId, accountId),
    });

    if (!account) return;

    const currentBalance = parseFloat(account.currentBalance);
    const newBalance =
      operation === "add" ? currentBalance + amount : currentBalance - amount;

    await AccountsRepository.updateBalance(accountId, newBalance.toFixed(4));
  }

  /**
   * Get transactions summary for a date range
   */
  static async getSummary(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalIncome: string;
    totalExpense: string;
    netIncome: string;
    transactionCount: number;
  }> {
    const result = await db
      .select({
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
          isNull(transactions.recurringTransactionId), // Exclude recurring transaction templates
        ),
      )
      .groupBy(transactions.type);

    let totalIncome = 0;
    let totalExpense = 0;
    let transactionCount = 0;

    for (const row of result) {
      if (row.type === "income") {
        totalIncome = parseFloat(row.total);
      } else if (row.type === "expense") {
        totalExpense = parseFloat(row.total);
      }
      transactionCount += row.count;
    }

    return {
      totalIncome: totalIncome.toFixed(4),
      totalExpense: totalExpense.toFixed(4),
      netIncome: (totalIncome - totalExpense).toFixed(4),
      transactionCount,
    };
  }
}
