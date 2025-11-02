import { eq, and, desc, lte, gte } from "drizzle-orm";
import { db } from "../db/connection";
import {
  recurringTransactions,
  type RecurringTransaction,
  type NewRecurringTransaction,
} from "../db/schema";

export class RecurringRepository {
  /**
   * Get all recurring transactions for a user
   */
  static async findByUserId(userId: string): Promise<RecurringTransaction[]> {
    return await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.userId, userId))
      .orderBy(desc(recurringTransactions.createdAt));
  }

  /**
   * Get active recurring transactions for a user
   */
  static async findActiveByUserId(
    userId: string,
  ): Promise<RecurringTransaction[]> {
    return await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.userId, userId),
          eq(recurringTransactions.isActive, "true"),
        ),
      )
      .orderBy(desc(recurringTransactions.nextOccurrence));
  }

  /**
   * Get recurring transaction by ID
   */
  static async findById(
    id: string,
    userId: string,
  ): Promise<RecurringTransaction | null> {
    const [recurring] = await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.userId, userId),
        ),
      )
      .limit(1);

    return recurring || null;
  }

  /**
   * Create new recurring transaction
   */
  static async create(
    data: NewRecurringTransaction,
  ): Promise<RecurringTransaction> {
    const [recurring] = await db
      .insert(recurringTransactions)
      .values(data)
      .returning();
    return recurring;
  }

  /**
   * Update recurring transaction
   */
  static async update(
    id: string,
    userId: string,
    data: Partial<NewRecurringTransaction>,
  ): Promise<RecurringTransaction | null> {
    const [recurring] = await db
      .update(recurringTransactions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.userId, userId),
        ),
      )
      .returning();

    return recurring || null;
  }

  /**
   * Delete recurring transaction
   */
  static async delete(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.id, id),
          eq(recurringTransactions.userId, userId),
        ),
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Get recurring transactions that are due (nextOccurrence <= now and active)
   */
  static async findDue(userId: string): Promise<RecurringTransaction[]> {
    const now = new Date();
    return await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.userId, userId),
          eq(recurringTransactions.isActive, "true"),
          eq(recurringTransactions.autoCreate, "true"),
          lte(recurringTransactions.nextOccurrence, now),
        ),
      );
  }

  /**
   * Get all recurring transactions that are due across all users
   * (for batch processing)
   */
  static async findAllDue(): Promise<RecurringTransaction[]> {
    const now = new Date();
    return await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.isActive, "true"),
          eq(recurringTransactions.autoCreate, "true"),
          lte(recurringTransactions.nextOccurrence, now),
        ),
      );
  }

  /**
   * Update next occurrence date
   */
  static async updateNextOccurrence(
    id: string,
    nextOccurrence: Date,
    lastCreated: Date,
  ): Promise<RecurringTransaction | null> {
    const [recurring] = await db
      .update(recurringTransactions)
      .set({
        nextOccurrence,
        lastCreated,
        updatedAt: new Date(),
      })
      .where(eq(recurringTransactions.id, id))
      .returning();

    return recurring || null;
  }
}
