import { useState, useEffect, FormEvent } from "react";
import { Modal } from "../components/common/Modal";
import { AccountsService } from "../services/accounts.service";
import type {
  Account,
  CreateAccountRequest,
  AccountType,
} from "../types/account";

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: "checking", label: "Checking", icon: "🏦" },
  { value: "savings", label: "Savings", icon: "💰" },
  { value: "credit_card", label: "Credit Card", icon: "💳" },
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "investment", label: "Investment", icon: "📈" },
  { value: "loan", label: "Loan", icon: "🏠" },
  { value: "other", label: "Other", icon: "📦" },
];

const CURRENCY_OPTIONS = [
  "BDT",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "INR",
];

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateAccountRequest>({
    name: "",
    type: "checking",
    currency: "BDT",
    initialBalance: "0",
    description: "",
    color: "#3b82f6",
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setIsLoading(true);
      const data = await AccountsService.getAll();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || "Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (account?: Account) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        name: account.name,
        type: account.type,
        currency: account.currency,
        initialBalance: account.initialBalance,
        description: account.description || "",
        color: account.color || "#3b82f6",
      });
    } else {
      setEditingAccount(null);
      setFormData({
        name: "",
        type: "checking",
        currency: "BDT",
        initialBalance: "0",
        description: "",
        color: "#3b82f6",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (editingAccount) {
        await AccountsService.update(editingAccount.id, formData);
      } else {
        await AccountsService.create(formData);
      }
      await loadAccounts();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || "Failed to save account");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;

    try {
      await AccountsService.delete(id);
      await loadAccounts();
    } catch (err: any) {
      setError(err.message || "Failed to delete account");
    }
  };

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const getAccountIcon = (type: AccountType) => {
    return ACCOUNT_TYPES.find((t) => t.value === type)?.icon || "📦";
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
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-600 mt-1">Manage your financial accounts</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn btn-primary">
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
          Add Account
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Accounts Grid */}
      {accounts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">💳</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No accounts yet
          </h3>
          <p className="text-gray-600 mb-4">
            Get started by creating your first account
          </p>
          <button onClick={() => handleOpenModal()} className="btn btn-primary">
            Create Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="card hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${account.color}20` }}
                  >
                    {getAccountIcon(account.type)}
                  </div>
                  <div className="ml-3">
                    <h3 className="font-semibold text-gray-900">
                      {account.name}
                    </h3>
                    <p className="text-sm text-gray-500 capitalize">
                      {account.type.replace("_", " ")}
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleOpenModal(account)}
                    className="text-gray-400 hover:text-primary-600 transition-colors"
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
                    onClick={() => handleDelete(account.id)}
                    className="text-gray-400 hover:text-danger-600 transition-colors"
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

              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600">Current Balance</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(account.currentBalance, account.currency)}
                  </p>
                </div>
                {account.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {account.description}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between text-xs text-gray-500">
                <span>
                  Status: {account.isActive === "true" ? "Active" : "Inactive"}
                </span>
                <span>{account.currency}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingAccount ? "Edit Account" : "Add Account"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="input"
              placeholder="My Checking Account"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as AccountType,
                })
              }
              className="input"
              required
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency
              </label>
              <select
                value={formData.currency}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                className="input"
                required
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Initial Balance
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.initialBalance}
                onChange={(e) =>
                  setFormData({ ...formData, initialBalance: e.target.value })
                }
                className="input"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="input"
              rows={3}
              placeholder="Additional details about this account..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <input
              type="color"
              value={formData.color}
              onChange={(e) =>
                setFormData({ ...formData, color: e.target.value })
              }
              className="h-10 w-full rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingAccount ? "Update" : "Create"} Account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
