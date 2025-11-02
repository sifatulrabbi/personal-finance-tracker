// Transaction types
export type TransactionType = "income" | "expense";
export type TransactionCategory = string;

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Account types
export interface Account {
  id: string;
  name: string;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

// Budget types
export interface Budget {
  id: string;
  category: TransactionCategory;
  amount: number;
  period: "monthly" | "yearly";
  startDate: Date;
  endDate?: Date;
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}
