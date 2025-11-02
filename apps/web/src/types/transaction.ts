export type TransactionType = "income" | "expense" | "transfer";

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId?: string | null;
  type: TransactionType;
  amount: string;
  currency: string;
  date: string;
  description?: string | null;
  notes?: string | null;
  payee?: string | null;
  reference?: string | null;
  toAccountId?: string | null;
  recurringTransactionId?: string | null;
  receiptUrl?: string | null;
  isReconciled: string;
  reconciledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionRequest {
  accountId: string;
  categoryId?: string;
  type: TransactionType;
  amount: string;
  currency?: string;
  date?: string;
  description?: string;
  notes?: string;
  payee?: string;
  reference?: string;
  toAccountId?: string;
  receiptUrl?: string;
}

export interface UpdateTransactionRequest {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
  amount?: string;
  currency?: string;
  date?: string;
  description?: string;
  notes?: string;
  payee?: string;
  reference?: string;
  toAccountId?: string;
  receiptUrl?: string;
}

export interface TransactionFilters {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
}

export interface TransactionSummary {
  totalIncome: string;
  totalExpense: string;
  netIncome: string;
  transactionCount: number;
}
