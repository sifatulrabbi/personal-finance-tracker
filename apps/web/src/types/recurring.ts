export type RecurringFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export interface RecurringTransaction {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  amount: string;
  currency: string;
  frequency: RecurringFrequency;
  startDate: string;
  endDate: string | null;
  nextOccurrence: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  isActive: string;
  autoCreate: string;
  lastCreated: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringRequest {
  accountId: string;
  categoryId?: string | null;
  name: string;
  description?: string;
  amount: string;
  currency?: string;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
  autoCreate?: boolean;
}

export interface UpdateRecurringRequest {
  accountId?: string;
  categoryId?: string | null;
  name?: string;
  description?: string;
  amount?: string;
  currency?: string;
  frequency?: RecurringFrequency;
  startDate?: string;
  endDate?: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
  autoCreate?: boolean;
}
