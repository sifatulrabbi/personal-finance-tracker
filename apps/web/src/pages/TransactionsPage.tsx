import { useState, useEffect, FormEvent } from "react";
import { Modal } from "../components/common/Modal";
import { TransactionsService } from "../services/transactions.service";
import { AccountsService } from "../services/accounts.service";
import type {
  Transaction,
  CreateTransactionRequest,
  TransactionType,
} from "../types/transaction";
import type { Account } from "../types/account";

const TRANSACTION_TYPES: {
  value: TransactionType;
  label: string;
  icon: string;
  color: string;
}[] = [
  { value: "income", label: "Income", icon: "💰", color: "text-success-600" },
  { value: "expense", label: "Expense", icon: "💸", color: "text-danger-600" },
  {
    value: "transfer",
    label: "Transfer",
    icon: "🔄",
    color: "text-primary-600",
  },
];

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);

  const [formData, setFormData] = useState<CreateTransactionRequest>({
    accountId: "",
    type: "expense",
    amount: "0",
    currency: "BDT",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [transactionsData, accountsData] = await Promise.all([
        TransactionsService.getAll({ limit: 50 }),
        AccountsService.getAll(),
      ]);
      setTransactions(transactionsData);
      setAccounts(accountsData);
      if (accountsData.length > 0 && !formData.accountId) {
        setFormData((prev) => ({ ...prev, accountId: accountsData[0].id }));
      }
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({
        accountId: transaction.accountId,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        date: transaction.date.split("T")[0],
        description: transaction.description || "",
        toAccountId: transaction.toAccountId || undefined,
      });
    } else {
      setEditingTransaction(null);
      setFormData({
        accountId: accounts[0]?.id || "",
        type: "expense",
        amount: "0",
        currency: "BDT",
        date: new Date().toISOString().split("T")[0],
        description: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (editingTransaction) {
        await TransactionsService.update(editingTransaction.id, formData);
      } else {
        await TransactionsService.create(formData);
      }
      await loadData();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || "Failed to save transaction");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
      await TransactionsService.delete(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete transaction");
    }
  };

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getAccountName = (accountId: string) => {
    return accounts.find((a) => a.id === accountId)?.name || "Unknown";
  };

  const getTransactionTypeInfo = (type: TransactionType) => {
    return (
      TRANSACTION_TYPES.find((t) => t.value === type) || TRANSACTION_TYPES[1]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Transactions
          </h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Track your income and expenses
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary w-full sm:w-auto"
        >
          <svg
            className="w-5 h-5 mr-2 inline"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Transaction
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Transactions List */}
      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl md:text-6xl mb-4">📝</div>
          <h3 className="text-base md:text-lg font-medium text-gray-900 mb-2">
            No transactions yet
          </h3>
          <p className="text-sm md:text-base text-gray-600 mb-4">
            Start tracking by adding your first transaction
          </p>
          <button
            onClick={() => handleOpenModal()}
            className="btn btn-primary w-full sm:w-auto"
          >
            Add Transaction
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block card">
            <div className="overflow-x-auto">
              <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Type
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Description
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Account
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Amount
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => {
                  const typeInfo = getTransactionTypeInfo(transaction.type);
                  return (
                    <tr
                      key={transaction.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {formatDate(transaction.date)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center ${typeInfo.color}`}
                        >
                          <span className="mr-1">{typeInfo.icon}</span>
                          <span className="text-sm font-medium">
                            {typeInfo.label}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {transaction.description || "—"}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {getAccountName(transaction.accountId)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right text-sm font-semibold ${typeInfo.color}`}
                      >
                        {transaction.type === "expense" && "- "}
                        {transaction.type === "income" && "+ "}
                        {formatCurrency(
                          transaction.amount,
                          transaction.currency,
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenModal(transaction)}
                          className="text-gray-400 hover:text-primary-600 mr-2"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(transaction.id)}
                          className="text-gray-400 hover:text-danger-600"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {transactions.map((transaction) => {
            const typeInfo = getTransactionTypeInfo(transaction.type);
            return (
              <div key={transaction.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">{typeInfo.icon}</span>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {transaction.description || "No description"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(transaction.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(transaction)}
                      className="text-gray-400 hover:text-primary-600 p-1"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(transaction.id)}
                      className="text-gray-400 hover:text-danger-600 p-1"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <div>
                    <p className="text-xs text-gray-500">Account</p>
                    <p className="text-sm text-gray-700">
                      {getAccountName(transaction.accountId)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className={`text-lg font-semibold ${typeInfo.color}`}>
                      {transaction.type === "expense" && "- "}
                      {transaction.type === "income" && "+ "}
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTransaction ? "Edit Transaction" : "Add Transaction"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as TransactionType,
                })
              }
              className="input"
              required
            >
              {TRANSACTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account
            </label>
            <select
              value={formData.accountId}
              onChange={(e) =>
                setFormData({ ...formData, accountId: e.target.value })
              }
              className="input"
              required
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          </div>

          {formData.type === "transfer" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Account
              </label>
              <select
                value={formData.toAccountId || ""}
                onChange={(e) =>
                  setFormData({ ...formData, toAccountId: e.target.value })
                }
                className="input"
                required
              >
                <option value="">Select destination account</option>
                {accounts
                  .filter((a) => a.id !== formData.accountId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className="input"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="input"
              rows={3}
              placeholder="What was this transaction for?"
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="btn btn-secondary order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary order-1 sm:order-2"
            >
              {editingTransaction ? "Update" : "Create"} Transaction
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
