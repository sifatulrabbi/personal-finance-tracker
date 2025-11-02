import { Context } from "hono";
import { z } from "zod";
import { TransactionsRepository } from "../repositories/transactions.repository";
import { getAuthUser } from "../middleware/auth.middleware";

const createTransactionSchema = z.object({
  accountId: z.string().uuid("Invalid account ID"),
  categoryId: z.string().uuid("Invalid category ID").optional(),
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string().regex(/^-?\d+(\.\d{1,4})?$/, "Invalid amount format"),
  currency: z.string().length(3).default("USD"),
  date: z.string().datetime().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  payee: z.string().optional(),
  reference: z.string().optional(),
  toAccountId: z.string().uuid("Invalid destination account ID").optional(),
  receiptUrl: z.string().url().optional(),
});

const updateTransactionSchema = createTransactionSchema.partial();

const querySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(["income", "expense", "transfer"]).optional(),
});

export class TransactionsController {
  /**
   * GET /transactions
   * Get all transactions with optional filters
   */
  static async getAll(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const query = c.req.query();
      const validation = querySchema.safeParse(query);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      const options = {
        ...validation.data,
        startDate: validation.data.startDate
          ? new Date(validation.data.startDate)
          : undefined,
        endDate: validation.data.endDate
          ? new Date(validation.data.endDate)
          : undefined,
      };

      const transactionsData = await TransactionsRepository.findByUserId(
        userId,
        options,
      );

      return c.json({
        success: true,
        data: transactionsData,
      });
    } catch (error) {
      console.error("Get transactions error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch transactions",
        },
        500,
      );
    }
  }

  /**
   * GET /transactions/:id
   * Get transaction by ID
   */
  static async getById(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const transaction = await TransactionsRepository.findById(id, userId);

      if (!transaction) {
        return c.json(
          {
            error: "Not Found",
            message: "Transaction not found",
          },
          404,
        );
      }

      // Get splits if any
      const splits = await TransactionsRepository.getSplits(id);

      return c.json({
        success: true,
        data: {
          ...transaction,
          splits: splits.length > 0 ? splits : undefined,
        },
      });
    } catch (error) {
      console.error("Get transaction error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch transaction",
        },
        500,
      );
    }
  }

  /**
   * POST /transactions
   * Create new transaction
   */
  static async create(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const body = await c.req.json();
      const validation = createTransactionSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      // Validate transfer has toAccountId
      if (validation.data.type === "transfer" && !validation.data.toAccountId) {
        return c.json(
          {
            error: "Validation Error",
            message: "Transfer transactions require a destination account",
          },
          400,
        );
      }

      const transaction = await TransactionsRepository.create({
        ...validation.data,
        userId,
        date: validation.data.date
          ? new Date(validation.data.date)
          : new Date(),
      });

      return c.json(
        {
          success: true,
          data: transaction,
        },
        201,
      );
    } catch (error) {
      console.error("Create transaction error:", error);
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
   * PATCH /transactions/:id
   * Update transaction
   */
  static async update(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");
      const body = await c.req.json();
      const validation = updateTransactionSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      const updateData = {
        ...validation.data,
        date: validation.data.date ? new Date(validation.data.date) : undefined,
      };

      const transaction = await TransactionsRepository.update(
        id,
        userId,
        updateData,
      );

      if (!transaction) {
        return c.json(
          {
            error: "Not Found",
            message: "Transaction not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      console.error("Update transaction error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to update transaction",
        },
        500,
      );
    }
  }

  /**
   * DELETE /transactions/:id
   * Delete transaction
   */
  static async delete(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const deleted = await TransactionsRepository.delete(id, userId);

      if (!deleted) {
        return c.json(
          {
            error: "Not Found",
            message: "Transaction not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        message: "Transaction deleted successfully",
      });
    } catch (error) {
      console.error("Delete transaction error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to delete transaction",
        },
        500,
      );
    }
  }

  /**
   * GET /transactions/summary
   * Get transactions summary for a date range
   */
  static async getSummary(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const { startDate, endDate } = c.req.query();

      if (!startDate || !endDate) {
        return c.json(
          {
            error: "Validation Error",
            message: "startDate and endDate are required",
          },
          400,
        );
      }

      const summary = await TransactionsRepository.getSummary(
        userId,
        new Date(startDate),
        new Date(endDate),
      );

      return c.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("Get summary error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch summary",
        },
        500,
      );
    }
  }
}
