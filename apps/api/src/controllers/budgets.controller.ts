import { Context } from "hono";
import { z } from "zod";
import { BudgetsRepository } from "../repositories/budgets.repository";
import { getAuthUser } from "../middleware/auth.middleware";

const createBudgetSchema = z.object({
  categoryId: z.string().uuid("Invalid category ID").nullable().optional(),
  name: z.string().min(1, "Name is required"),
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/, "Invalid amount format"),
  currency: z.string().length(3).default("BDT"),
  period: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  startDate: z.string(),
  endDate: z.string().optional(),
  allowRollover: z.boolean().default(false),
  alertEnabled: z.boolean().default(true),
  alertThreshold: z.number().min(0).max(100).default(80),
});

const updateBudgetSchema = createBudgetSchema.partial();

export class BudgetsController {
  /**
   * GET /budgets
   * Get all budgets with spending info
   */
  static async getAll(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const budgetsWithSpending =
        await BudgetsRepository.getAllWithSpending(userId);

      return c.json({
        success: true,
        data: budgetsWithSpending,
      });
    } catch (error) {
      console.error("Get budgets error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch budgets",
        },
        500,
      );
    }
  }

  /**
   * GET /budgets/:id
   * Get budget by ID with spending info
   */
  static async getById(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const budgetWithSpending = await BudgetsRepository.getBudgetWithSpending(
        id,
        userId,
      );

      if (!budgetWithSpending) {
        return c.json(
          {
            error: "Not Found",
            message: "Budget not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: budgetWithSpending,
      });
    } catch (error) {
      console.error("Get budget error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch budget",
        },
        500,
      );
    }
  }

  /**
   * POST /budgets
   * Create new budget
   */
  static async create(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const body = await c.req.json();
      const validation = createBudgetSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      const budget = await BudgetsRepository.create({
        ...validation.data,
        userId,
        allowRollover: validation.data.allowRollover ? "true" : "false",
        alertEnabled: validation.data.alertEnabled ? "true" : "false",
        startDate: new Date(validation.data.startDate),
        endDate: validation.data.endDate
          ? new Date(validation.data.endDate)
          : undefined,
      });

      return c.json(
        {
          success: true,
          data: budget,
        },
        201,
      );
    } catch (error) {
      console.error("Create budget error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to create budget",
        },
        500,
      );
    }
  }

  /**
   * PATCH /budgets/:id
   * Update budget
   */
  static async update(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");
      const body = await c.req.json();
      const validation = updateBudgetSchema.safeParse(body);

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
      if (validation.data.categoryId !== undefined) {
        // Allow setting to null for "All Categories"
        updateData.categoryId = validation.data.categoryId;
      }
      if (validation.data.name) updateData.name = validation.data.name;
      if (validation.data.amount) updateData.amount = validation.data.amount;
      if (validation.data.currency) updateData.currency = validation.data.currency;
      if (validation.data.period) updateData.period = validation.data.period;
      if (validation.data.alertThreshold !== undefined) updateData.alertThreshold = validation.data.alertThreshold;

      if (validation.data.allowRollover !== undefined) {
        updateData.allowRollover = validation.data.allowRollover ? "true" : "false";
      }

      if (validation.data.alertEnabled !== undefined) {
        updateData.alertEnabled = validation.data.alertEnabled ? "true" : "false";
      }

      if (validation.data.startDate) {
        updateData.startDate = new Date(validation.data.startDate);
      }

      if (validation.data.endDate && validation.data.endDate.trim() !== "") {
        updateData.endDate = new Date(validation.data.endDate);
      } else if (validation.data.endDate === "") {
        // Explicitly set to null if empty string is passed
        updateData.endDate = null;
      }

      const budget = await BudgetsRepository.update(id, userId, updateData);

      if (!budget) {
        return c.json(
          {
            error: "Not Found",
            message: "Budget not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: budget,
      });
    } catch (error) {
      console.error("Update budget error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to update budget",
        },
        500,
      );
    }
  }

  /**
   * DELETE /budgets/:id
   * Delete budget
   */
  static async delete(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const deleted = await BudgetsRepository.delete(id, userId);

      if (!deleted) {
        return c.json(
          {
            error: "Not Found",
            message: "Budget not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        message: "Budget deleted successfully",
      });
    } catch (error) {
      console.error("Delete budget error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to delete budget",
        },
        500,
      );
    }
  }
}
