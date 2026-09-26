// Query keys, one per server resource. Keep them flat so invalidating one resource never
// touches another by prefix (history is not under "transactions" on purpose).
export const keys = {
  wallets: ["wallets"] as const,
  transactions: ["transactions"] as const,
  history: (id: string) => ["history", id] as const,
  historyAll: ["history"] as const,
  categories: ["categories"] as const,
  settings: ["settings"] as const,
  schedules: ["schedules"] as const,
  dueBills: ["bills", "due"] as const,
  monthly: (month: string) => ["monthly", month] as const,
  monthlyAll: ["monthly"] as const,
  audit: ["audit"] as const,
};

export const pageSize = 50;
