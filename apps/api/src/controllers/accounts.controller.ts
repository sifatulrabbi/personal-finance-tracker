import { Context } from "hono";
import { z } from "zod";
import { AccountsRepository } from "../repositories/accounts.repository";
import { getAuthUser } from "../middleware/auth.middleware";

const createAccountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum([
    "checking",
    "savings",
    "credit_card",
    "cash",
    "investment",
    "loan",
    "other",
  ]),
  currency: z.string().length(3).default("USD"),
  initialBalance: z
    .string()
    .regex(/^-?\d+(\.\d{1,4})?$/, "Invalid amount format")
    .default("0"),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

const updateAccountSchema = createAccountSchema.partial();

export class AccountsController {
  /**
   * GET /accounts
   * Get all accounts for authenticated user
   */
  static async getAll(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const accounts = await AccountsRepository.findByUserId(userId);

      return c.json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      console.error("Get accounts error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch accounts",
        },
        500,
      );
    }
  }

  /**
   * GET /accounts/:id
   * Get account by ID
   */
  static async getById(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const account = await AccountsRepository.findById(id, userId);

      if (!account) {
        return c.json(
          {
            error: "Not Found",
            message: "Account not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: account,
      });
    } catch (error) {
      console.error("Get account error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch account",
        },
        500,
      );
    }
  }

  /**
   * POST /accounts
   * Create new account
   */
  static async create(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const body = await c.req.json();
      const validation = createAccountSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      const account = await AccountsRepository.create({
        ...validation.data,
        userId,
      });

      return c.json(
        {
          success: true,
          data: account,
        },
        201,
      );
    } catch (error) {
      console.error("Create account error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to create account",
        },
        500,
      );
    }
  }

  /**
   * PATCH /accounts/:id
   * Update account
   */
  static async update(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");
      const body = await c.req.json();
      const validation = updateAccountSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            error: "Validation Error",
            details: validation.error.flatten().fieldErrors,
          },
          400,
        );
      }

      const account = await AccountsRepository.update(
        id,
        userId,
        validation.data,
      );

      if (!account) {
        return c.json(
          {
            error: "Not Found",
            message: "Account not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: account,
      });
    } catch (error) {
      console.error("Update account error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to update account",
        },
        500,
      );
    }
  }

  /**
   * DELETE /accounts/:id
   * Delete account
   */
  static async delete(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const id = c.req.param("id");

      const deleted = await AccountsRepository.delete(id, userId);

      if (!deleted) {
        return c.json(
          {
            error: "Not Found",
            message: "Account not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error) {
      console.error("Delete account error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to delete account",
        },
        500,
      );
    }
  }

  /**
   * GET /accounts/balances
   * Get total balances by currency
   */
  static async getBalances(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const balances = await AccountsRepository.getTotalBalances(userId);

      return c.json({
        success: true,
        data: Object.fromEntries(balances),
      });
    } catch (error) {
      console.error("Get balances error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch balances",
        },
        500,
      );
    }
  }
}
