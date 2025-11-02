export type AccountType =
  | "checking"
  | "savings"
  | "credit_card"
  | "cash"
  | "investment"
  | "loan"
  | "other";

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: string;
  currentBalance: string;
  description?: string | null;
  color?: string | null;
  isActive: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: string;
  description?: string;
  color?: string;
}

export interface UpdateAccountRequest {
  name?: string;
  type?: AccountType;
  currency?: string;
  initialBalance?: string;
  description?: string;
  color?: string;
  isActive?: string;
}

export interface AccountBalance {
  [currency: string]: string;
}
