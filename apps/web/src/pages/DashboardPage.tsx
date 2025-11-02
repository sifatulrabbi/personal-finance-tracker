import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { AccountsService } from "../services/accounts.service";
import { TransactionsService } from "../services/transactions.service";
import type { AccountBalance, Account } from "../types/account";
import type { Transaction } from "../types/transaction";

export function DashboardPage() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<AccountBalance>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>(
    [],
  );
  const [monthStats, setMonthStats] = useState({
    income: "0",
    expense: "0",
    count: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      const [balancesData, accountsData, transactionsData] = await Promise.all([
        AccountsService.getBalances(),
        AccountsService.getAll(),
        TransactionsService.getAll({ limit: 5 }),
      ]);

      setBalances(balancesData);
      setAccounts(accountsData);
      setRecentTransactions(transactionsData);

      // Get this month's summary
      const now = new Date();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ).toISOString();
      const endOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      ).toISOString();

      const summary = await TransactionsService.getSummary(
        startOfMonth,
        endOfMonth,
      );
      setMonthStats({
        income: summary.totalIncome,
        expense: summary.totalExpense,
        count: summary.transactionCount,
      });
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: string, currency: string = "USD") => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const getTotalBalance = () => {
    const total = Object.entries(balances).reduce((sum, [currency, amount]) => {
      return sum + parseFloat(amount);
    }, 0);
    return formatCurrency(total.toFixed(2));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome back, {user?.displayName || user?.username}!
        </h2>
        <p className="text-gray-600">Here's your financial overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Balance</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {getTotalBalance()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {accounts.length} accounts
              </p>
            </div>
            <div className="p-3 bg-primary-100 rounded-lg">
              <svg
                className="w-6 h-6 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Income (This Month)</p>
              <p className="text-2xl font-bold text-success-600 mt-1">
                {formatCurrency(monthStats.income)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {monthStats.count} transactions
              </p>
            </div>
            <div className="p-3 bg-success-100 rounded-lg">
              <svg
                className="w-6 h-6 text-success-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Expenses (This Month)</p>
              <p className="text-2xl font-bold text-danger-600 mt-1">
                {formatCurrency(monthStats.expense)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {monthStats.count} transactions
              </p>
            </div>
            <div className="p-3 bg-danger-100 rounded-lg">
              <svg
                className="w-6 h-6 text-danger-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Transactions */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Transactions
            </h3>
            <Link
              to="/transactions"
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              View all →
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        transaction.type === "income"
                          ? "bg-success-100"
                          : transaction.type === "expense"
                            ? "bg-danger-100"
                            : "bg-primary-100"
                      }`}
                    >
                      {transaction.type === "income" && (
                        <span className="text-success-600">💰</span>
                      )}
                      {transaction.type === "expense" && (
                        <span className="text-danger-600">💸</span>
                      )}
                      {transaction.type === "transfer" && (
                        <span className="text-primary-600">🔄</span>
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        {transaction.description || "No description"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(transaction.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      transaction.type === "income"
                        ? "text-success-600"
                        : transaction.type === "expense"
                          ? "text-danger-600"
                          : "text-primary-600"
                    }`}
                  >
                    {transaction.type === "expense" && "- "}
                    {transaction.type === "income" && "+ "}
                    {formatCurrency(transaction.amount, transaction.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <Link
              to="/accounts"
              className="flex items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-primary-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="font-medium text-gray-900">Manage Accounts</p>
                <p className="text-sm text-gray-500">
                  Add or edit your accounts
                </p>
              </div>
            </Link>
            <Link
              to="/transactions"
              className="flex items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-success-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="font-medium text-gray-900">Add Transaction</p>
                <p className="text-sm text-gray-500">
                  Record income or expense
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Getting Started
        </h3>
        <div className="space-y-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-primary-600 font-semibold">1</span>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">
                Create Your First Account
              </h4>
              <p className="text-sm text-gray-600">
                Set up your checking, savings, or credit card accounts to start
                tracking.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-primary-600 font-semibold">2</span>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Add Transactions</h4>
              <p className="text-sm text-gray-600">
                Record your income and expenses to get a complete financial
                picture.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-3">
              <span className="text-primary-600 font-semibold">3</span>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Set Budgets & Goals</h4>
              <p className="text-sm text-gray-600">
                Create budgets and savings goals to stay on track with your
                finances.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
