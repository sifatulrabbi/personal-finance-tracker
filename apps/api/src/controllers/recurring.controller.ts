import { Context } from "hono";
import { z } from "zod";
import { RecurringRepository } from "../repositories/recurring.repository";
import { RecurringService } from "../services/recurring.service";
import { getAuthUser } from "../middleware/auth.middleware";

const recurringFrequencies = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

const createRecurringSchema = z.object({
  accountId: z.string().uuid("Invalid account ID"),
  categoryId: z.string().uuid("Invalid category ID").nullable().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/, "Invalid amount format"),
  currency: z.string().length(3).default("BDT"),
  frequency: z.enum(recurringFrequencies),
  startDate: z.string(),
  endDate: z.string().optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  autoCreate: z.boolean().default(false),
});

const updateRecurringSchema = createRecurringSchema.partial();

export class RecurringController {
  /**
   * GET /recurring
   * Get all recurring transactions
   */
  static async getAll(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const recurring = await RecurringRepository.findByUserId(userId);

      return c.json({
        success: true,
        data: recurring,
      });
    } catch (error) {
      console.error("Get recurring transactions error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch recurring transactions",
        },
        500,
      );
    }
  }

  /**
   * GET /recurring/active
   * Get active recurring transactions
   */
  static async getActive(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const recurring = await RecurringRepository.findActiveByUserId(userId);

      return c.json({
        success: true,
        data: recurring,
      });
    } catch (error) {
      console.error("Get active recurring transactions error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch active recurring transactions",
        },
        500,
      );
    }
  }

  /**
   * GET /recurring/:id
   * Get recurring transaction by ID
   */
  static async getById(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const recurring = await RecurringRepository.findById(id, userId);

      if (!recurring) {
        return c.json(
          {
            error: "Not Found",
            message: "Recurring transaction not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: recurring,
      });
    } catch (error) {
      console.error("Get recurring transaction error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch recurring transaction",
        },
        500,
      );
    }
  }

  /**
   * POST /recurring
   * Create new recurring transaction
   */
  static async create(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const body = await c.req.json();
      const validation = createRecurringSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      // Calculate next occurrence based on frequency and start date
      const startDate = new Date(validation.data.startDate);
      const nextOccurrence = RecurringController.calculateNextOccurrence(
        startDate,
        validation.data.frequency,
        validation.data.dayOfMonth,
        validation.data.dayOfWeek,
      );

      const recurring = await RecurringRepository.create({
        userId,
        accountId: validation.data.accountId,
        categoryId: validation.data.categoryId || null,
        name: validation.data.name,
        description: validation.data.description || null,
        amount: validation.data.amount,
        currency: validation.data.currency,
        frequency: validation.data.frequency,
        startDate,
        endDate: validation.data.endDate && validation.data.endDate.trim() !== ""
          ? new Date(validation.data.endDate)
          : null,
        nextOccurrence,
        dayOfMonth: validation.data.dayOfMonth || null,
        dayOfWeek: validation.data.dayOfWeek || null,
        autoCreate: validation.data.autoCreate ? "true" : "false",
      });

      return c.json(
        {
          success: true,
          data: recurring,
        },
        201,
      );
    } catch (error) {
      console.error("Create recurring transaction error:", error);
      console.error("Error details:", error instanceof Error ? error.message : error);
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to create recurring transaction",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  }

  /**
   * PATCH /recurring/:id
   * Update recurring transaction
   */
  static async update(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");
      const body = await c.req.json();
      const validation = updateRecurringSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      const updateData: any = {};

      // Only include fields that are actually being updated
      if (validation.data.accountId) updateData.accountId = validation.data.accountId;
      if (validation.data.categoryId !== undefined) {
        updateData.categoryId = validation.data.categoryId;
      }
      if (validation.data.name) updateData.name = validation.data.name;
      if (validation.data.description !== undefined) {
        updateData.description = validation.data.description;
      }
      if (validation.data.amount) updateData.amount = validation.data.amount;
      if (validation.data.currency) updateData.currency = validation.data.currency;
      if (validation.data.frequency) updateData.frequency = validation.data.frequency;

      if (validation.data.startDate) {
        updateData.startDate = new Date(validation.data.startDate);
        // Recalculate next occurrence if start date changes
        const existing = await RecurringRepository.findById(id, userId);
        if (existing) {
          updateData.nextOccurrence = RecurringController.calculateNextOccurrence(
            updateData.startDate,
            validation.data.frequency || existing.frequency,
            validation.data.dayOfMonth ?? existing.dayOfMonth ?? undefined,
            validation.data.dayOfWeek ?? existing.dayOfWeek ?? undefined,
          );
        }
      }

      if (validation.data.endDate && validation.data.endDate.trim() !== "") {
        updateData.endDate = new Date(validation.data.endDate);
      } else if (validation.data.endDate === "") {
        updateData.endDate = null;
      }

      if (validation.data.dayOfMonth !== undefined) {
        updateData.dayOfMonth = validation.data.dayOfMonth;
      }
      if (validation.data.dayOfWeek !== undefined) {
        updateData.dayOfWeek = validation.data.dayOfWeek;
      }

      if (validation.data.autoCreate !== undefined) {
        updateData.autoCreate = validation.data.autoCreate ? "true" : "false";
      }

      const recurring = await RecurringRepository.update(id, userId, updateData);

      if (!recurring) {
        return c.json(
          {
            error: "Not Found",
            message: "Recurring transaction not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: recurring,
      });
    } catch (error) {
      console.error("Update recurring transaction error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to update recurring transaction",
        },
        500,
      );
    }
  }

  /**
   * DELETE /recurring/:id
   * Delete recurring transaction
   */
  static async delete(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const deleted = await RecurringRepository.delete(id, userId);

      if (!deleted) {
        return c.json(
          {
            error: "Not Found",
            message: "Recurring transaction not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        message: "Recurring transaction deleted successfully",
      });
    } catch (error) {
      console.error("Delete recurring transaction error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to delete recurring transaction",
        },
        500,
      );
    }
  }

  /**
   * PATCH /recurring/:id/toggle
   * Toggle active status
   */
  static async toggleActive(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const existing = await RecurringRepository.findById(id, userId);
      if (!existing) {
        return c.json(
          {
            error: "Not Found",
            message: "Recurring transaction not found",
          },
          404,
        );
      }

      const isActive = existing.isActive === "true" ? "false" : "true";
      const recurring = await RecurringRepository.update(id, userId, {
        isActive,
      });

      return c.json({
        success: true,
        data: recurring,
      });
    } catch (error) {
      console.error("Toggle recurring transaction error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to toggle recurring transaction",
        },
        500,
      );
    }
  }

  /**
   * POST /recurring/:id/create-now
   * Manually create a transaction from recurring template
   */
  static async createNow(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const result = await RecurringService.createNow(id, userId);

      if (!result.success) {
        return c.json(
          {
            error: "Error",
            message: result.error || "Failed to create transaction",
          },
          400,
        );
      }

      return c.json({
        success: true,
        message: "Transaction created successfully",
      });
    } catch (error) {
      console.error("Create now error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to create transaction",
        },
        500,
      );
    }
  }

  /**
   * POST /recurring/process-due
   * Process all due recurring transactions for current user
   */
  static async processDue(c: Context) {
    try {
      const { userId } = getAuthUser(c);

      const result = await RecurringService.processDueRecurringForUser(userId);

      return c.json({
        success: true,
        data: {
          created: result.created,
          errors: result.errors,
        },
      });
    } catch (error) {
      console.error("Process due recurring transactions error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to process recurring transactions",
        },
        500,
      );
    }
  }

  /**
   * Calculate next occurrence based on frequency
   */
  private static calculateNextOccurrence(
    startDate: Date,
    frequency: string,
    dayOfMonth?: number,
    dayOfWeek?: number,
  ): Date {
    const next = new Date(startDate);

    switch (frequency) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "biweekly":
        next.setDate(next.getDate() + 14);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        if (dayOfMonth) {
          next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        }
        break;
      case "quarterly":
        next.setMonth(next.getMonth() + 3);
        if (dayOfMonth) {
          next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
        }
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        break;
    }

    return next;
  }
}
