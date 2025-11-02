import { apiClient } from "./api";
import type {
  BudgetWithSpending,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from "../types/budget";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export class BudgetsService {
  /**
   * Get all budgets with spending info
   */
  static async getAll(): Promise<BudgetWithSpending[]> {
    const response = await apiClient.get<ApiResponse<BudgetWithSpending[]>>("/api/budgets");
    return response.data;
  }

  /**
   * Get budget by ID with spending info
   */
  static async getById(id: string): Promise<BudgetWithSpending> {
    const response = await apiClient.get<ApiResponse<BudgetWithSpending>>(`/api/budgets/${id}`);
    return response.data;
  }

  /**
   * Create new budget
   */
  static async create(data: CreateBudgetRequest): Promise<BudgetWithSpending> {
    const response = await apiClient.post<ApiResponse<BudgetWithSpending>>("/api/budgets", data);
    return response.data;
  }

  /**
   * Update budget
   */
  static async update(
    id: string,
    data: UpdateBudgetRequest,
  ): Promise<BudgetWithSpending> {
    const response = await apiClient.patch<ApiResponse<BudgetWithSpending>>(`/api/budgets/${id}`, data);
    return response.data;
  }

  /**
   * Delete budget
   */
  static async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/budgets/${id}`);
  }
}
