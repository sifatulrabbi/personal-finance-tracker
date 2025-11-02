import { RecurringRepository } from "../repositories/recurring.repository";
import { TransactionsRepository } from "../repositories/transactions.repository";
import type { RecurringTransaction } from "../db/schema";

export class RecurringService {
  /**
   * Process all due recurring transactions for a specific user
   */
  static async processDueRecurringForUser(
    userId: string,
  ): Promise<{ created: number; errors: string[] }> {
    const dueRecurring = await RecurringRepository.findDue(userId);

    let created = 0;
    const errors: string[] = [];

    for (const recurring of dueRecurring) {
      try {
        await this.createTransactionFromRecurring(recurring);
        created++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(
          `Failed to create transaction for recurring ${recurring.id}: ${errorMessage}`,
        );
      }
    }

    return { created, errors };
  }

  /**
   * Process all due recurring transactions across all users
   * (for batch processing via cron job)
   */
  static async processAllDueRecurring(): Promise<{
    processed: number;
    created: number;
    errors: string[];
  }> {
    const allDue = await RecurringRepository.findAllDue();

    let processed = 0;
    let created = 0;
    const errors: string[] = [];

    for (const recurring of allDue) {
      processed++;
      try {
        await this.createTransactionFromRecurring(recurring);
        created++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(
          `Failed to create transaction for recurring ${recurring.id} (user: ${recurring.userId}): ${errorMessage}`,
        );
      }
    }

    return { processed, created, errors };
  }

  /**
   * Create a transaction from a recurring transaction template
   */
  private static async createTransactionFromRecurring(
    recurring: RecurringTransaction,
  ): Promise<void> {
    // Check if we should still process (hasn't passed end date)
    if (recurring.endDate && new Date() > recurring.endDate) {
      // Deactivate the recurring transaction
      await RecurringRepository.update(recurring.id, recurring.userId, {
        isActive: "false",
      });
      return;
    }

    // Create the transaction
    await TransactionsRepository.create({
      userId: recurring.userId,
      accountId: recurring.accountId,
      categoryId: recurring.categoryId,
      type: "expense", // Recurring transactions are typically expenses (subscriptions, bills)
      amount: recurring.amount,
      currency: recurring.currency,
      date: recurring.nextOccurrence,
      description: recurring.description || recurring.name,
      notes: `Auto-created from recurring: ${recurring.name}`,
      recurringTransactionId: null, // We could store the recurring ID here for tracking
    });

    // Calculate next occurrence
    const nextOccurrence = this.calculateNextOccurrence(
      recurring.nextOccurrence,
      recurring.frequency,
      recurring.dayOfMonth ?? undefined,
      recurring.dayOfWeek ?? undefined,
    );

    // Update the recurring transaction
    await RecurringRepository.updateNextOccurrence(
      recurring.id,
      nextOccurrence,
      new Date(),
    );
  }

  /**
   * Calculate next occurrence based on current date and frequency
   */
  private static calculateNextOccurrence(
    currentDate: Date,
    frequency: string,
    dayOfMonth?: number,
    dayOfWeek?: number,
  ): Date {
    const next = new Date(currentDate);

    switch (frequency) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        if (dayOfWeek !== undefined) {
          // Adjust to the correct day of week
          const currentDay = next.getDay();
          const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
          if (daysToAdd > 0) {
            next.setDate(next.getDate() + daysToAdd);
          }
        }
        break;
      case "biweekly":
        next.setDate(next.getDate() + 14);
        if (dayOfWeek !== undefined) {
          const currentDay = next.getDay();
          const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
          if (daysToAdd > 0) {
            next.setDate(next.getDate() + daysToAdd);
          }
        }
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        if (dayOfMonth) {
          // Set to the specified day of month, or last day if day doesn't exist in month
          const lastDayOfMonth = new Date(
            next.getFullYear(),
            next.getMonth() + 1,
            0,
          ).getDate();
          next.setDate(Math.min(dayOfMonth, lastDayOfMonth));
        }
        break;
      case "quarterly":
        next.setMonth(next.getMonth() + 3);
        if (dayOfMonth) {
          const lastDayOfMonth = new Date(
            next.getFullYear(),
            next.getMonth() + 1,
            0,
          ).getDate();
          next.setDate(Math.min(dayOfMonth, lastDayOfMonth));
        }
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        break;
    }

    return next;
  }

  /**
   * Manually trigger creation of a transaction from a recurring template
   * (useful for "create now" button in UI)
   */
  static async createNow(
    recurringId: string,
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const recurring = await RecurringRepository.findById(recurringId, userId);

      if (!recurring) {
        return { success: false, error: "Recurring transaction not found" };
      }

      if (recurring.isActive !== "true") {
        return { success: false, error: "Recurring transaction is not active" };
      }

      await this.createTransactionFromRecurring(recurring);

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }
}
