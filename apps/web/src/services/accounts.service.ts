import { apiClient } from "./api";
import type {
  Account,
  CreateAccountRequest,
  UpdateAccountRequest,
  AccountBalance,
} from "../types/account";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export class AccountsService {
  static async getAll(): Promise<Account[]> {
    const response =
      await apiClient.get<ApiResponse<Account[]>>("/api/accounts");
    return response.data;
  }

  static async getById(id: string): Promise<Account> {
    const response = await apiClient.get<ApiResponse<Account>>(
      `/api/accounts/${id}`,
    );
    return response.data;
  }

  static async create(data: CreateAccountRequest): Promise<Account> {
    const response = await apiClient.post<ApiResponse<Account>>(
      "/api/accounts",
      data,
    );
    return response.data;
  }

  static async update(
    id: string,
    data: UpdateAccountRequest,
  ): Promise<Account> {
    const response = await apiClient.patch<ApiResponse<Account>>(
      `/api/accounts/${id}`,
      data,
    );
    return response.data;
  }

  static async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/accounts/${id}`);
  }

  static async getBalances(): Promise<AccountBalance> {
    const response = await apiClient.get<ApiResponse<AccountBalance>>(
      "/api/accounts/balances",
    );
    return response.data;
  }
}
