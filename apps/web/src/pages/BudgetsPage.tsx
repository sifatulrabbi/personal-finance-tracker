import { useState, useEffect, FormEvent } from "react";
import { Modal } from "../components/common/Modal";
import { BudgetsService } from "../services/budgets.service";
import { CategoriesService } from "../services/categories.service";
import type {
  BudgetWithSpending,
  CreateBudgetRequest,
  BudgetPeriod,
} from "../types/budget";
import type { Category } from "../types/category";

const BUDGET_PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetWithSpending[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithSpending | null>(
    null,
  );

  const [formData, setFormData] = useState<CreateBudgetRequest>({
    categoryId: null,
    name: "",
    amount: "0",
    currency: "BDT",
    period: "monthly",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    allowRollover: false,
    alertEnabled: true,
    alertThreshold: 80,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [budgetsData, categoriesData] = await Promise.all([
        BudgetsService.getAll(),
        CategoriesService.getAll("expense"),
      ]);
      setBudgets(budgetsData);
      setCategories(categoriesData);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (budgetWithSpending?: BudgetWithSpending) => {
    if (budgetWithSpending) {
      const { budget } = budgetWithSpending;
      setEditingBudget(budgetWithSpending);
      setFormData({
        categoryId: budget.categoryId,
        name: budget.name,
        amount: budget.amount,
        currency: budget.currency,
        period: budget.period,
        startDate: budget.startDate.split("T")[0],
        endDate: budget.endDate ? budget.endDate.split("T")[0] : "",
        allowRollover: budget.allowRollover === "true",
        alertEnabled: budget.alertEnabled === "true",
        alertThreshold: budget.alertThreshold || 80,
      });
    } else {
      setEditingBudget(null);
      setFormData({
        categoryId: null,
        name: "",
        amount: "0",
        currency: "BDT",
        period: "monthly",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        allowRollover: false,
        alertEnabled: true,
        alertThreshold: 80,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBudget(null);
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (editingBudget) {
        await BudgetsService.update(editingBudget.budget.id, formData);
      } else {
        await BudgetsService.create(formData);
      }
      await loadData();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || "Failed to save budget");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this budget?")) return;

    try {
      await BudgetsService.delete(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete budget");
    }
  };

  const formatCurrency = (amount: string, currency: string = "BDT") => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const getProgressColor = (percentage: number): string => {
    if (percentage < 50) return "bg-success-600";
    if (percentage < 80) return "bg-primary-600";
    if (percentage < 100) return "bg-warning-600";
    return "bg-danger-600";
  };

  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return "All Categories";
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || "Unknown";
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Budgets</h1>
          <p className="text-gray-600 mt-1">
            Track your spending against your budget goals
          </p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn btn-primary">
          <span className="text-xl mr-2">+</span> Add Budget
        </button>
      </div>

      {error && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {budgets.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No budgets yet
          </h3>
          <p className="text-gray-600 mb-6">
            Create your first budget to start tracking your spending
          </p>
          <button onClick={() => handleOpenModal()} className="btn btn-primary">
            Create Budget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map((item) => {
            const { budget, spent, remaining, percentage } = item;
            const isOverBudget = parseFloat(remaining) < 0;
            const isNearLimit =
              percentage >= (budget.alertThreshold || 80) && !isOverBudget;

            return (
              <div
                key={budget.id}
                className={`card hover:shadow-lg transition-shadow ${
                  !budget.categoryId ? "border-2 border-primary-200" : ""
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {budget.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {getCategoryName(budget.categoryId)} •{" "}
                      {budget.period.charAt(0).toUpperCase() +
                        budget.period.slice(1)}
                    </p>
                    {!budget.categoryId && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                        Tracking all expenses
                      </span>
                    )}
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
                      onClick={() => handleDelete(budget.id)}
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

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Spent</span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(spent, budget.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600">Budget</span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(budget.amount, budget.currency)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                      <div
                        className={`h-3 rounded-full transition-all ${getProgressColor(percentage)}`}
                        style={{
                          width: `${Math.min(percentage, 100)}%`,
                        }}
                      ></div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">
                        {percentage.toFixed(0)}% used
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          isOverBudget ? "text-danger-600" : "text-success-600"
                        }`}
                      >
                        {isOverBudget ? "Over by " : ""}
                        {formatCurrency(
                          Math.abs(parseFloat(remaining)).toFixed(4),
                          budget.currency,
                        )}
                        {!isOverBudget ? " left" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Alerts */}
                  {isNearLimit && (
                    <div className="bg-warning-50 border border-warning-200 rounded p-2">
                      <p className="text-xs text-warning-800">
                        ⚠️ You've reached {percentage.toFixed(0)}% of your
                        budget
                      </p>
                    </div>
                  )}
                  {isOverBudget && (
                    <div className="bg-danger-50 border border-danger-200 rounded p-2">
                      <p className="text-xs text-danger-800">
                        🚨 Budget exceeded!
                      </p>
                    </div>
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
        title={editingBudget ? "Edit Budget" : "Create New Budget"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Budget Name
            </label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
            />
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
              <option value="">📊 All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select a specific category or track all expenses
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                Period
              </label>
              <select
                className="input"
                value={formData.period}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    period: e.target.value as BudgetPeriod,
                  })
                }
              >
                {BUDGET_PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              Alert Threshold (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              className="input"
              value={formData.alertThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  alertThreshold: parseInt(e.target.value),
                })
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              Get alerted when you reach this percentage of your budget
            </p>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                className="mr-2"
                checked={formData.alertEnabled}
                onChange={(e) =>
                  setFormData({ ...formData, alertEnabled: e.target.checked })
                }
              />
              <span className="text-sm text-gray-700">Enable alerts</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                className="mr-2"
                checked={formData.allowRollover}
                onChange={(e) =>
                  setFormData({ ...formData, allowRollover: e.target.checked })
                }
              />
              <span className="text-sm text-gray-700">Allow rollover</span>
            </label>
          </div>

          {error && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              {editingBudget ? "Update Budget" : "Create Budget"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
