import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/connection";
import { accounts, exchangeRates, type Account, type NewAccount } from "../db/schema";

export class AccountsRepository {
  /**
   * Get all accounts for a user
   */
  static async findByUserId(userId: string): Promise<Account[]> {
    return await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(desc(accounts.createdAt));
  }

  /**
   * Get account by ID
   */
  static async findById(id: string, userId: string): Promise<Account | null> {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .limit(1);

    return account || null;
  }

  /**
   * Create new account
   */
  static async create(data: NewAccount): Promise<Account> {
    const [account] = await db
      .insert(accounts)
      .values({
        ...data,
        currentBalance: data.initialBalance || "0",
      })
      .returning();

    return account;
  }

  /**
   * Update account
   */
  static async update(
    id: string,
    userId: string,
    data: Partial<NewAccount>,
  ): Promise<Account | null> {
    const [account] = await db
      .update(accounts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();

    return account || null;
  }

  /**
   * Delete account
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();

    return result.length > 0;
  }

  /**
   * Update account balance
   */
  static async updateBalance(
    id: string,
    newBalance: string,
  ): Promise<Account | null> {
    const [account] = await db
      .update(accounts)
      .set({
        currentBalance: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, id))
      .returning();

    return account || null;
  }

  /**
   * Get total balance across all accounts (converted to BDT)
   */
  static async getTotalBalances(userId: string): Promise<Map<string, string>> {
    const userAccounts = await this.findByUserId(userId);

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

    let totalInBDT = 0;

    // Convert each account balance to BDT and sum
    for (const account of userAccounts) {
      if (account.isActive === "true") {
        const balance = parseFloat(account.currentBalance);
        const rate = exchangeRateMap.get(account.currency) || 1;
        totalInBDT += balance * rate;
      }
    }

    const balances = new Map<string, string>();
    balances.set("BDT", totalInBDT.toFixed(4));
    return balances;
  }
}
