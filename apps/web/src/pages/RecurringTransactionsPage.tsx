import { useState, useEffect, FormEvent } from "react";
import { Modal } from "../components/common/Modal";
import { RecurringService } from "../services/recurring.service";
import { AccountsService } from "../services/accounts.service";
import { CategoriesService } from "../services/categories.service";
import type {
  RecurringTransaction,
  CreateRecurringRequest,
  RecurringFrequency,
} from "../types/recurring";
import type { Account } from "../types/account";
import type { Category } from "../types/category";

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function RecurringTransactionsPage() {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] =
    useState<RecurringTransaction | null>(null);

  const [formData, setFormData] = useState<CreateRecurringRequest>({
    accountId: "",
    categoryId: null,
    name: "",
    description: "",
    amount: "0",
    currency: "BDT",
    frequency: "monthly",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    autoCreate: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [recurringData, accountsData, categoriesData] = await Promise.all([
        RecurringService.getAll(),
        AccountsService.getAll(),
        CategoriesService.getAll("expense"),
      ]);
      setRecurring(recurringData);
      setAccounts(accountsData);
      setCategories(categoriesData);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (recurringTx?: RecurringTransaction) => {
    if (recurringTx) {
      setEditingRecurring(recurringTx);
      setFormData({
        accountId: recurringTx.accountId,
        categoryId: recurringTx.categoryId,
        name: recurringTx.name,
        description: recurringTx.description || "",
        amount: recurringTx.amount,
        currency: recurringTx.currency,
        frequency: recurringTx.frequency,
        startDate: recurringTx.startDate.split("T")[0],
        endDate: recurringTx.endDate ? recurringTx.endDate.split("T")[0] : "",
        dayOfMonth: recurringTx.dayOfMonth || undefined,
        dayOfWeek: recurringTx.dayOfWeek || undefined,
        autoCreate: recurringTx.autoCreate === "true",
      });
    } else {
      setEditingRecurring(null);
      setFormData({
        accountId: "",
        categoryId: null,
        name: "",
        description: "",
        amount: "0",
        currency: "BDT",
        frequency: "monthly",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        autoCreate: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecurring(null);
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (editingRecurring) {
        await RecurringService.update(editingRecurring.id, formData);
      } else {
        await RecurringService.create(formData);
      }
      await loadData();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || "Failed to save recurring transaction");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recurring transaction?"))
      return;

    try {
      await RecurringService.delete(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete recurring transaction");
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await RecurringService.toggleActive(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to toggle status");
    }
  };

  const handleCreateNow = async (id: string) => {
    if (!confirm("Create a transaction now from this recurring template?"))
      return;

    try {
      await RecurringService.createNow(id);
      alert("Transaction created successfully!");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create transaction");
    }
  };

  const handleProcessDue = async () => {
    if (!confirm("Process all due recurring transactions?")) return;

    try {
      const result = await RecurringService.processDue();
      alert(
        `Created ${result.created} transaction(s).\n${result.errors.length > 0 ? `Errors: ${result.errors.join(", ")}` : ""}`,
      );
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to process recurring transactions");
    }
  };

  const getAccountName = (accountId: string): string => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.name} (${account.currency})` : "Unknown";
  };

  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return "No category";
    const category = categories.find((c) => c.id === categoryId);
    return category ? `${category.icon} ${category.name}` : "Unknown";
  };

  const formatCurrency = (amount: string, currency: string = "BDT") => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getFrequencyLabel = (frequency: RecurringFrequency): string => {
    const freq = FREQUENCIES.find((f) => f.value === frequency);
    return freq ? freq.label : frequency;
  };

  const showDayOfMonthField = () => {
    return ["monthly", "quarterly", "yearly"].includes(formData.frequency);
  };

  const showDayOfWeekField = () => {
    return ["weekly", "biweekly"].includes(formData.frequency);
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
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Recurring Transactions
          </h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Manage your subscriptions and recurring expenses
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleProcessDue}
            className="btn btn-secondary w-full sm:w-auto"
            title="Process all due recurring transactions"
          >
            ⚡ Process Due
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="btn btn-primary w-full sm:w-auto"
          >
            <span className="text-xl mr-2">+</span> Add Recurring
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {recurring.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl md:text-6xl mb-4">🔄</div>
          <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
            No recurring transactions yet
          </h3>
          <p className="text-sm md:text-base text-gray-600 mb-6">
            Set up recurring transactions for subscriptions, rent, bills, and
            more
          </p>
          <button
            onClick={() => handleOpenModal()}
            className="btn btn-primary w-full sm:w-auto"
          >
            Create Recurring Transaction
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {recurring.map((item) => {
            const isActive = item.isActive === "true";
            const autoCreate = item.autoCreate === "true";
            const nextDate = new Date(item.nextOccurrence);
            const isDue = nextDate <= new Date();

            return (
              <div
                key={item.id}
                className={`card hover:shadow-lg transition-shadow ${
                  !isActive ? "opacity-60 border-2 border-gray-300" : ""
                } ${isDue && isActive && autoCreate ? "border-2 border-warning-300" : ""}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {item.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {getCategoryName(item.categoryId)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {getAccountName(item.accountId)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(item)}
                      className="text-primary-600 hover:text-primary-700"
                      title="Edit"
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
                      onClick={() => handleDelete(item.id)}
                      className="text-danger-600 hover:text-danger-700"
                      title="Delete"
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

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Amount</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(item.amount, item.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Frequency</span>
                    <span className="font-medium text-gray-900">
                      {getFrequencyLabel(item.frequency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Next Date</span>
                    <span
                      className={`font-medium ${isDue && isActive && autoCreate ? "text-warning-700" : "text-gray-900"}`}
                    >
                      {formatDate(item.nextOccurrence)}
                      {isDue && isActive && autoCreate && " ⚠️"}
                    </span>
                  </div>
                  {item.endDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Ends</span>
                      <span className="text-gray-900">
                        {formatDate(item.endDate)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {isActive ? (
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-success-100 text-success-700 rounded">
                      Active
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                      Inactive
                    </span>
                  )}
                  {autoCreate && (
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                      Auto-create
                    </span>
                  )}
                  {isDue && isActive && autoCreate && (
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-warning-100 text-warning-700 rounded">
                      Due
                    </span>
                  )}
                </div>

                {item.description && (
                  <p className="text-xs text-gray-600 mb-3">
                    {item.description}
                  </p>
                )}

                <div className="flex gap-2 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => handleToggleActive(item.id)}
                    className={`flex-1 text-xs py-2 px-3 rounded ${
                      isActive
                        ? "bg-gray-100 hover:bg-gray-200 text-gray-700"
                        : "bg-success-100 hover:bg-success-200 text-success-700"
                    }`}
                  >
                    {isActive ? "Deactivate" : "Activate"}
                  </button>
                  {isActive && (
                    <button
                      onClick={() => handleCreateNow(item.id)}
                      className="flex-1 text-xs py-2 px-3 rounded bg-primary-100 hover:bg-primary-200 text-primary-700"
                    >
                      Create Now
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={
          editingRecurring
            ? "Edit Recurring Transaction"
            : "Create Recurring Transaction"
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Netflix Subscription"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account
            </label>
            <select
              className="input"
              value={formData.accountId}
              onChange={(e) =>
                setFormData({ ...formData, accountId: e.target.value })
              }
              required
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              className="input"
              value={formData.categoryId || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  categoryId: e.target.value === "" ? null : e.target.value,
                })
              }
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency
              </label>
              <select
                className="input"
                value={formData.frequency}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    frequency: e.target.value as RecurringFrequency,
                  })
                }
              >
                {FREQUENCIES.map((freq) => (
                  <option key={freq.value} value={freq.value}>
                    {freq.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showDayOfMonthField() && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Day of Month (1-31)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                className="input"
                value={formData.dayOfMonth || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dayOfMonth: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                placeholder="Leave empty to use start date"
              />
            </div>
          )}

          {showDayOfWeekField() && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Day of Week
              </label>
              <select
                className="input"
                value={formData.dayOfWeek ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dayOfWeek: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">Use start date</option>
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                className="input"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date (Optional)
              </label>
              <input
                type="date"
                className="input"
                value={formData.endDate}
                onChange={(e) =>
                  setFormData({ ...formData, endDate: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              className="input"
              rows={3}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Additional notes..."
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                className="mr-2"
                checked={formData.autoCreate}
                onChange={(e) =>
                  setFormData({ ...formData, autoCreate: e.target.checked })
                }
              />
              <span className="text-sm text-gray-700">
                Automatically create transactions
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              When enabled, transactions will be created automatically on the
              scheduled date
            </p>
          </div>

          {error && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="btn btn-secondary flex-1 order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1 order-1 sm:order-2"
            >
              {editingRecurring ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
