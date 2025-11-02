import { Context } from "hono";
import { CategoriesRepository } from "../repositories/categories.repository";
import { getAuthUser } from "../middleware/auth.middleware";

export class CategoriesController {
  /**
   * GET /categories
   * Get all categories for authenticated user
   */
  static async getAll(c: Context) {
    try {
      const { userId } = getAuthUser(c);
      const type = c.req.query("type") as "income" | "expense" | undefined;

      let categories;
      if (type) {
        categories = await CategoriesRepository.findByType(userId, type);
      } else {
        categories = await CategoriesRepository.findByUserId(userId);
      }

      return c.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Get categories error:", error);
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to fetch categories",
        },
        500,
      );
    }
  }
}
