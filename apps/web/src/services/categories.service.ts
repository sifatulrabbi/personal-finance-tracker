import { apiClient } from "./api";
import type { Category, CategoryType } from "../types/category";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export class CategoriesService {
  /**
   * Get all categories
   */
  static async getAll(type?: CategoryType): Promise<Category[]> {
    const params = type ? `?type=${type}` : "";
    const response = await apiClient.get<ApiResponse<Category[]>>(`/api/categories${params}`);
    return response.data;
  }
}
