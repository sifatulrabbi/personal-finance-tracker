"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Plus, Wallet } from "lucide-react";
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
import { formatCurrency } from "@/libs/format";
import { cn } from "@/libs/utils";
import { useAccountStore } from "@/providers/account-store-provider";
import type { Account } from "@/stores/account-store";

import { TransactionSheet } from "../transactions/transaction-sheet";
import { AccountCard } from "./account-card";
import { AccountFormDrawer } from "./account-form-drawer";
import { AccountSkeletons } from "./account-skeletons";

export function AccountsPageClient() {
  const { householdId } = useSession();
  const accounts = useAccountStore((s) => s.accounts);
  const loading = useAccountStore((s) => s.loading);
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);
  const deleteAccount = useAccountStore((s) => s.deleteAccount);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchAccounts(householdId);
  }, [fetchAccounts, householdId]);

  const totalBalance = accounts.reduce(
    (sum, a) => sum + a.currentBalanceMinor,
    0,
  );
  const isTotalNegative = totalBalance < 0;

  async function handleDelete() {
    if (!deletingAccount) return;
    setDeleteLoading(true);
    try {
      await deleteAccount(householdId, deletingAccount.id);
      toast.success("Account deleted");
      setDeletingAccount(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        actions={
          accounts.length > 1 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTransferOpen(true)}
            >
              <ArrowLeftRight className="size-4" />
            </Button>
          ) : null
        }
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {loading && accounts.length === 0 ? (
          <AccountSkeletons />
        ) : accounts.length === 0 ? (
          <Empty className="my-auto">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet />
              </EmptyMedia>
              <EmptyTitle>No accounts yet</EmptyTitle>
              <EmptyDescription>
                Add your first money-holding account to start tracking.
              </EmptyDescription>
            </EmptyHeader>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" />
              Add Account
            </Button>
          </Empty>
        ) : (
          <>
            {/* Total balance */}
            <div className="flex flex-col items-center gap-0.5 py-2">
              <span className="text-xs text-muted-foreground">
                Total Balance
              </span>
              <span
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  isTotalNegative ? "text-destructive" : "text-foreground",
                )}
              >
                {formatCurrency(totalBalance)}
              </span>
            </div>

            {/* Account cards */}
            <div className="flex flex-col gap-3">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={setEditingAccount}
                  onDelete={setDeletingAccount}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* FAB - Add Account */}
      {accounts.length > 0 && (
        <button
          onClick={() => setCreateOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="size-5" />
        </button>
      )}

      {/* Create drawer */}
      <AccountFormDrawer open={createOpen} onOpenChange={setCreateOpen} />

      {/* Edit drawer */}
      <AccountFormDrawer
        open={!!editingAccount}
        onOpenChange={(open) => {
          if (!open) setEditingAccount(null);
        }}
        account={editingAccount}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletingAccount}
        onOpenChange={(open) => {
          if (!open) setDeletingAccount(null);
        }}
        title="Delete Account"
        description={`Are you sure you want to delete "${deletingAccount?.name}"? This action cannot be undone.`}
        loading={deleteLoading}
        onConfirm={handleDelete}
      />

      {/* Transfer sheet — same component as the transactions page, but
          locked to the transfer variant. */}
      <TransactionSheet
        key={transferOpen ? "transfer-open" : "transfer-closed"}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        defaultType="transfer"
      />
    </>
  );
}
