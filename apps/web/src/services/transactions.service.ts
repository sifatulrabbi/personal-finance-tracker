import { apiClient } from "./api";
import type {
  Transaction,
  CreateTransactionRequest,
  UpdateTransactionRequest,
  TransactionFilters,
  TransactionSummary,
} from "../types/transaction";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export class TransactionsService {
  static async getAll(filters?: TransactionFilters): Promise<Transaction[]> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
    }

    const queryString = params.toString();
    const endpoint = queryString
      ? `/api/transactions?${queryString}`
      : "/api/transactions";

    const response = await apiClient.get<ApiResponse<Transaction[]>>(endpoint);
    return response.data;
  }

  static async getById(id: string): Promise<Transaction> {
    const response = await apiClient.get<ApiResponse<Transaction>>(
      `/api/transactions/${id}`,
    );
    return response.data;
  }

  static async create(data: CreateTransactionRequest): Promise<Transaction> {
    const response = await apiClient.post<ApiResponse<Transaction>>(
      "/api/transactions",
      data,
    );
    return response.data;
  }

  static async update(
    id: string,
    data: UpdateTransactionRequest,
  ): Promise<Transaction> {
    const response = await apiClient.patch<ApiResponse<Transaction>>(
      `/api/transactions/${id}`,
      data,
    );
    return response.data;
  }

  static async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/transactions/${id}`);
  }

  static async getSummary(
    startDate: string,
    endDate: string,
  ): Promise<TransactionSummary> {
    const params = new URLSearchParams({ startDate, endDate });
    const response = await apiClient.get<ApiResponse<TransactionSummary>>(
      `/api/transactions/summary?${params.toString()}`,
    );
    return response.data;
  }
}
