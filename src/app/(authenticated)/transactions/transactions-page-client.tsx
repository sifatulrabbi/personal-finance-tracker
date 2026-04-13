"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Banknote, Plus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccountStore } from "@/providers/account-store-provider";
import { useCategoryStore } from "@/providers/category-store-provider";
import { useCurrencyStore } from "@/providers/currency-store-provider";
import { usePersonStore } from "@/providers/person-store-provider";
import { useTransactionStore } from "@/providers/transaction-store-provider";
import type { Transaction } from "@/stores/transaction-store";

import { ExpenseDrawer } from "./expense-drawer";
import { IncomeDrawer } from "./income-drawer";
import { TransactionFilters } from "./transaction-filters";
import { TransactionList } from "./transaction-list";
import { TransactionSkeletons } from "./transaction-skeletons";

export function TransactionsPageClient() {
  const { householdId } = useSession();

  const transactions = useTransactionStore((s) => s.transactions);
  const meta = useTransactionStore((s) => s.meta);
  const loading = useTransactionStore((s) => s.loading);
  const loadingMore = useTransactionStore((s) => s.loadingMore);
  const filters = useTransactionStore((s) => s.filters);
  const fetchTransactions = useTransactionStore((s) => s.fetchTransactions);
  const loadMore = useTransactionStore((s) => s.loadMore);
  const setFilters = useTransactionStore((s) => s.setFilters);
  const deleteTransaction = useTransactionStore((s) => s.deleteTransaction);

  const fetchPeople = usePersonStore((s) => s.fetchPeople);
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);
  const fetchCategories = useCategoryStore((s) => s.fetchCategories);
  const fetchCurrencies = useCurrencyStore((s) => s.fetchCurrencies);

  const [expenseDrawerOpen, setExpenseDrawerOpen] = useState(false);
  const [incomeDrawerOpen, setIncomeDrawerOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] =
    useState<Transaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchPeople(householdId);
    fetchAccounts(householdId);
    fetchCategories(householdId);
    fetchCurrencies(householdId);
  }, [
    fetchPeople,
    fetchAccounts,
    fetchCategories,
    fetchCurrencies,
    householdId,
  ]);

  useEffect(() => {
    fetchTransactions(householdId);
  }, [fetchTransactions, householdId, filters]);

  const displayTransactions = useMemo(() => {
    if (filters.type === "transfer") {
      return transactions.filter((t) => t.transferGroupId !== null);
    }
    return transactions;
  }, [transactions, filters.type]);

  // Transfers are client-side filtered — pagination doesn't apply to that tab
  const hasMore =
    filters.type !== "transfer" && meta.page * meta.pageSize < meta.total;

  function handleTabChange(value: unknown) {
    if (typeof value === "string") {
      setFilters({
        type: value as "all" | "expense" | "income" | "transfer",
      });
    }
  }

  function handleEdit(transaction: Transaction) {
    setExpenseDrawerOpen(false);
    setIncomeDrawerOpen(false);
    setEditingTransaction(transaction);
  }

  async function handleDelete() {
    if (!deletingTransaction) return;
    setDeleteLoading(true);
    try {
      await deleteTransaction(householdId, deletingTransaction.id);
      toast.success("Transaction deleted");
      setDeletingTransaction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  }

  const editingExpense =
    editingTransaction?.type === "expense" ? editingTransaction : null;
  const editingIncome =
    editingTransaction?.type === "income" ? editingTransaction : null;

  const isTransferDelete =
    !!deletingTransaction && deletingTransaction.transferGroupId !== null;
  const deleteDescription = isTransferDelete
    ? "This will delete both the outgoing and incoming sides of this transfer. This action cannot be undone."
    : `Are you sure you want to delete this ${deletingTransaction?.type ?? "transaction"}? This action cannot be undone.`;

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIncomeDrawerOpen(true)}
          >
            <Banknote className="size-4" />
          </Button>
        }
      />

      <Tabs value={filters.type} onValueChange={handleTabChange}>
        <TabsList variant="line" className="w-full px-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="expense">Expenses</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="transfer">Transfers</TabsTrigger>
        </TabsList>
      </Tabs>

      <TransactionFilters />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {loading && transactions.length === 0 ? (
          <TransactionSkeletons />
        ) : displayTransactions.length === 0 ? (
          <Empty className="my-auto">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ArrowLeftRight />
              </EmptyMedia>
              <EmptyTitle>No transactions yet</EmptyTitle>
              <EmptyDescription>
                Record your first expense or income to get started.
              </EmptyDescription>
            </EmptyHeader>
            <Button size="sm" onClick={() => setExpenseDrawerOpen(true)}>
              <Plus data-icon="inline-start" />
              Add Expense
            </Button>
          </Empty>
        ) : (
          <>
            <TransactionList
              transactions={displayTransactions}
              onEdit={handleEdit}
              onDelete={setDeletingTransaction}
            />
            {hasMore && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => loadMore(householdId)}
                disabled={loadingMore}
              >
                {loadingMore && <Spinner />}
                Load More
              </Button>
            )}
          </>
        )}
      </div>

      {displayTransactions.length > 0 && (
        <button
          onClick={() => setExpenseDrawerOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="size-5" />
        </button>
      )}

      {/* Create/Edit expense drawer */}
      <ExpenseDrawer
        key={editingExpense?.id ?? "create-expense"}
        open={expenseDrawerOpen || !!editingExpense}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTransaction(null);
            setExpenseDrawerOpen(false);
          }
        }}
        transaction={editingExpense}
      />

      {/* Create/Edit income drawer */}
      <IncomeDrawer
        key={editingIncome?.id ?? "create-income"}
        open={incomeDrawerOpen || !!editingIncome}
        onOpenChange={(open) => {
          if (!open) {
            setEditingTransaction(null);
            setIncomeDrawerOpen(false);
          }
        }}
        transaction={editingIncome}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletingTransaction}
        onOpenChange={(open) => {
          if (!open) setDeletingTransaction(null);
        }}
        title="Delete Transaction"
        description={deleteDescription}
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
    </>
  );
}
