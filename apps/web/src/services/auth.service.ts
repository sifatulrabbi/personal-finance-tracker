import { apiClient } from "./api";
import type { LoginRequest, LoginResponse, User } from "../types/auth";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export class AuthService {
  static async login(
    credentials: LoginRequest,
  ): Promise<{ token: string; user: User }> {
    const response = await apiClient.post<LoginResponse>(
      "/api/auth/login",
      credentials,
    );

    if (response.success && response.data) {
      this.setToken(response.data.token);
      this.setUser(response.data.user);
      return response.data;
    }

    throw new Error("Login failed");
  }

  static async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<{ success: boolean; data: User }>(
      "/api/auth/me",
    );

    if (response.success && response.data) {
      this.setUser(response.data);
      return response.data;
    }

    throw new Error("Failed to get current user");
  }

  static logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  static setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  static getUser(): User | null {
    const userJson = localStorage.getItem(USER_KEY);
    if (!userJson) return null;

    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }

  static setUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  static isAuthenticated(): boolean {
    return !!this.getToken();
  }
}
