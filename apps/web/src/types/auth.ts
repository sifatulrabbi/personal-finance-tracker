export interface User {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  createdAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  };
}

export interface AuthError {
  error: string;
  message: string;
  details?: Record<string, string[]>;
}
