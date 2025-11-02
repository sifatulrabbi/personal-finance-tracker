import { apiClient } from "./api";
import type {
  RecurringTransaction,
  CreateRecurringRequest,
  UpdateRecurringRequest,
} from "../types/recurring";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface ProcessDueResponse {
  created: number;
  errors: string[];
}

export class RecurringService {
  /**
   * Get all recurring transactions
   */
  static async getAll(): Promise<RecurringTransaction[]> {
    const response = await apiClient.get<ApiResponse<RecurringTransaction[]>>(
      "/api/recurring",
    );
    return response.data;
  }

  /**
   * Get active recurring transactions
   */
  static async getActive(): Promise<RecurringTransaction[]> {
    const response = await apiClient.get<ApiResponse<RecurringTransaction[]>>(
      "/api/recurring/active",
    );
    return response.data;
  }

  /**
   * Get recurring transaction by ID
   */
  static async getById(id: string): Promise<RecurringTransaction> {
    const response = await apiClient.get<ApiResponse<RecurringTransaction>>(
      `/api/recurring/${id}`,
    );
    return response.data;
  }

  /**
   * Create new recurring transaction
   */
  static async create(
    data: CreateRecurringRequest,
  ): Promise<RecurringTransaction> {
    const response = await apiClient.post<ApiResponse<RecurringTransaction>>(
      "/api/recurring",
      data,
    );
    return response.data;
  }

  /**
   * Update recurring transaction
   */
  static async update(
    id: string,
    data: UpdateRecurringRequest,
  ): Promise<RecurringTransaction> {
    const response = await apiClient.patch<ApiResponse<RecurringTransaction>>(
      `/api/recurring/${id}`,
      data,
    );
    return response.data;
  }

  /**
   * Delete recurring transaction
   */
  static async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/recurring/${id}`);
  }

  /**
   * Toggle active status
   */
  static async toggleActive(id: string): Promise<RecurringTransaction> {
    const response = await apiClient.patch<ApiResponse<RecurringTransaction>>(
      `/api/recurring/${id}/toggle`,
    );
    return response.data;
  }

  /**
   * Create transaction now from recurring template
   */
  static async createNow(id: string): Promise<void> {
    await apiClient.post(`/api/recurring/${id}/create-now`);
  }

  /**
   * Process all due recurring transactions
   */
  static async processDue(): Promise<ProcessDueResponse> {
    const response = await apiClient.post<ApiResponse<ProcessDueResponse>>(
      "/api/recurring/process-due",
    );
    return response.data;
  }
}
