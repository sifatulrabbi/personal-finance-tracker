import { eq, and, desc, gte, lte, sql, isNull } from "drizzle-orm";
import { db } from "../db/connection";
import {
  transactions,
  transactionSplits,
  accounts,
  exchangeRates,
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
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (!account) return;

    const currentBalance = parseFloat(account.currentBalance);
    const newBalance =
      operation === "add" ? currentBalance + amount : currentBalance - amount;

    await AccountsRepository.updateBalance(accountId, newBalance.toFixed(4));
  }

  /**
   * Get transactions summary for a date range (converted to BDT)
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
    // Get all transactions in the date range
    const allTransactions = await db
      .select({
        type: transactions.type,
        amount: transactions.amount,
        currency: transactions.currency,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
          isNull(transactions.recurringTransactionId), // Exclude recurring transaction templates
        ),
      );

    // Get all exchange rates to BDT
    const rates = await db
      .select({
        fromCurrency: exchangeRates.fromCurrency,
        rate: exchangeRates.rate,
      })
      .from(exchangeRates)
      .where(eq(exchangeRates.toCurrency, "BDT"));

    // Create a map for quick lookup
    const exchangeRateMap = new Map<string, number>();
    for (const rate of rates) {
      exchangeRateMap.set(rate.fromCurrency, parseFloat(rate.rate));
    }

    let totalIncome = 0;
    let totalExpense = 0;
    let transactionCount = allTransactions.length;

    // Convert each transaction to BDT and sum
    for (const transaction of allTransactions) {
      const amount = parseFloat(transaction.amount);
      const rate = exchangeRateMap.get(transaction.currency) || 1;
      const amountInBDT = amount * rate;

      if (transaction.type === "income") {
        totalIncome += amountInBDT;
      } else if (transaction.type === "expense") {
        totalExpense += amountInBDT;
      }
    }

    return {
      totalIncome: totalIncome.toFixed(4),
      totalExpense: totalExpense.toFixed(4),
      netIncome: (totalIncome - totalExpense).toFixed(4),
      transactionCount,
    };
  }
}
