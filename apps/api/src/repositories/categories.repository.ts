import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/connection";
import { categories, type Category } from "../db/schema";

export class CategoriesRepository {
  /**
   * Get all categories for a user
   */
  static async findByUserId(userId: string): Promise<Category[]> {
    return await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(desc(categories.createdAt));
  }

  /**
   * Get categories by type (income/expense)
   */
  static async findByType(
    userId: string,
    type: "income" | "expense",
  ): Promise<Category[]> {
    return await db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.type, type)))
      .orderBy(desc(categories.createdAt));
  }
}
