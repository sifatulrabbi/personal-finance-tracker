export const config = {
  app: {
    name: "Finance Tracker",
    version: "1.0.0",
  },
  currency: {
    default: "USD",
    supported: ["USD", "EUR", "GBP", "JPY", "CNY"],
  },
  categories: {
    income: ["Salary", "Freelance", "Investment", "Other Income"],
    expense: [
      "Food & Dining",
      "Transportation",
      "Housing",
      "Utilities",
      "Entertainment",
      "Healthcare",
      "Shopping",
      "Other Expense",
    ],
  },
} as const;

export type Config = typeof config;
