// Query keys, one per server resource. Keep them flat so invalidating one resource never
// touches another by prefix (history is not under "transactions" on purpose).
export const keys = {
  summary: ["summary"] as const,
  wallets: ["wallets"] as const,
  // One wallet read by id. Not under "wallets", so a list refetch never touches it by prefix.
  wallet: (id: string) => ["wallet", id] as const,
  walletAll: ["wallet"] as const,
  transactions: ["transactions"] as const,
  history: (id: string) => ["history", id] as const,
  historyAll: ["history"] as const,
  categories: ["categories"] as const,
  settings: ["settings"] as const,
  schedules: ["schedules"] as const,
  dueBills: ["bills", "due"] as const,
  // Paid and skipped history. Not under "bills", so refreshing due bills leaves it alone.
  billHistory: (status: "paid" | "skipped") => ["bill-history", status] as const,
  billHistoryAll: ["bill-history"] as const,
  upcomingBills: ["upcoming-bills"] as const,
  monthly: (month: string) => ["monthly", month] as const,
  monthlyAll: ["monthly"] as const,
  audit: ["audit"] as const,
};

export const pageSize = 50;
