"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isBdt } from "@/libs/currency";
import { formatCurrency, formatOriginalCurrency } from "@/libs/format";
import { cn } from "@/libs/utils";
import type { Transaction } from "@/stores/transaction-store";

export function TransactionItem({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isTransfer = transaction.transferGroupId !== null;
  const badgeVariant = isTransfer
    ? "outline"
    : transaction.type === "expense"
      ? "destructive"
      : "default";
  const badgeLabel = isTransfer
    ? "Transfer"
    : transaction.type === "expense"
      ? "Expense"
      : "Income";
  const primaryLabel = isTransfer
    ? (transaction.description ?? "Transfer")
    : (transaction.category?.name ?? "Uncategorized");
  const amountColorClass =
    transaction.type === "expense" ? "text-destructive" : "text-emerald-500";
  const amountPrefix = transaction.type === "expense" ? "-" : "+";

  return (
    <div
      className="cursor-pointer rounded-lg bg-card ring-1 ring-foreground/10 transition-colors hover:bg-card/80"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariant}>{badgeLabel}</Badge>
            <span className="truncate text-sm font-medium">{primaryLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{transaction.person.name}</span>
            <span>&middot;</span>
            <span>{transaction.account.name}</span>
          </div>
          {transaction.description && !isTransfer && (
            <p className="truncate text-xs text-muted-foreground">
              {transaction.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              amountColorClass,
            )}
          >
            {amountPrefix}
            {formatCurrency(transaction.amountMinor)}
          </span>
          {!isBdt(transaction.originalCurrencyCode) && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatOriginalCurrency(
                transaction.originalAmountMinor,
                transaction.originalCurrencyCode,
              )}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="flex items-center gap-2 px-3 pb-2.5">
          {!isTransfer && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(transaction);
              }}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(transaction);
            }}
          >
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
