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
import type { TransactionType } from "@/libs/client/transaction-schemas";
import { useAccountStore } from "@/providers/account-store-provider";
import { useCategoryStore } from "@/providers/category-store-provider";
import { useCurrencyStore } from "@/providers/currency-store-provider";
import { usePersonStore } from "@/providers/person-store-provider";
import { useTransactionStore } from "@/providers/transaction-store-provider";
import type { Transaction } from "@/stores/transaction-store";

import { TransactionFilters } from "./transaction-filters";
import { TransactionList } from "./transaction-list";
import { TransactionSheet } from "./transaction-sheet";
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

  // Sheet state — the same sheet handles create and edit; `createType` seeds
  // the initial tab in create mode. `editingTransaction` switches the sheet
  // into edit mode for an existing row.
  const [createType, setCreateType] = useState<TransactionType | null>(null);
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

  function handleFilterTabChange(value: unknown) {
    if (typeof value === "string") {
      setFilters({
        type: value as "all" | "expense" | "income" | "transfer",
      });
    }
  }

  function openCreate(type: TransactionType) {
    setEditingTransaction(null);
    setCreateType(type);
  }

  function handleEdit(transaction: Transaction) {
    // Backend forbids editing transfers; the list should not expose Edit for
    // transfer rows, but guard here too in case a stale action slips through.
    if (transaction.transferGroupId !== null) {
      toast.error("Transfers can't be edited — delete and recreate instead.");
      return;
    }
    setCreateType(null);
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

  const isTransferDelete =
    !!deletingTransaction && deletingTransaction.transferGroupId !== null;
  const deleteDescription = isTransferDelete
    ? "This will delete both the outgoing and incoming sides of this transfer. This action cannot be undone."
    : `Are you sure you want to delete this ${deletingTransaction?.type ?? "transaction"}? This action cannot be undone.`;

  // Sheet open when either create or edit flow is active.
  const sheetOpen = createType !== null || editingTransaction !== null;

  function handleSheetOpenChange(next: boolean) {
    if (!next) {
      setCreateType(null);
      setEditingTransaction(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openCreate("income")}
          >
            <Banknote className="size-4" />
          </Button>
        }
      />

      <Tabs value={filters.type} onValueChange={handleFilterTabChange}>
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
            <Button size="sm" onClick={() => openCreate("expense")}>
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
          onClick={() => openCreate("expense")}
          className="fixed bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="size-5" />
        </button>
      )}

      <TransactionSheet
        // Key re-mounts the sheet when switching between create/edit so RHF
        // default values are honored without a manual reset dance.
        key={editingTransaction?.id ?? `create-${createType ?? "expense"}`}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        transaction={editingTransaction}
        defaultType={createType ?? "expense"}
      />

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
