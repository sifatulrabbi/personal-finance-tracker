export type CategoryType = "income" | "expense";

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: CategoryType;
  icon?: string | null;
  color?: string | null;
  parentId?: string | null;
  isSystem: string;
  isActive: string;
  createdAt: string;
  updatedAt: string;
}
