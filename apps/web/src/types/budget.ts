export type BudgetPeriod = "weekly" | "monthly" | "yearly";

export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  name: string;
  amount: string;
  currency: string;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string | null;
  allowRollover: string;
  alertEnabled: string;
  alertThreshold: number | null;
  isActive: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetWithSpending {
  budget: Budget;
  spent: string;
  remaining: string;
  percentage: number;
}

export interface CreateBudgetRequest {
  categoryId: string;
  name: string;
  amount: string;
  currency?: string;
  period?: BudgetPeriod;
  startDate: string;
  endDate?: string;
  allowRollover?: boolean;
  alertEnabled?: boolean;
  alertThreshold?: number;
}

export interface UpdateBudgetRequest {
  categoryId?: string;
  name?: string;
  amount?: string;
  currency?: string;
  period?: BudgetPeriod;
  startDate?: string;
  endDate?: string;
  allowRollover?: boolean;
  alertEnabled?: boolean;
  alertThreshold?: number;
}
