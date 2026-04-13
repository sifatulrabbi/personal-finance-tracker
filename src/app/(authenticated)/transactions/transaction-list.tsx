"use client";

import type { Transaction } from "@/stores/transaction-store";

import { TransactionItem } from "./transaction-item";

function formatDateLabel(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupByDate(transactions: Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  for (const txn of transactions) {
    const date = txn.transactionDate;
    const group = groups.get(date);
    if (group) {
      group.push(txn);
    } else {
      groups.set(date, [txn]);
    }
  }
  return groups;
}

export function TransactionList({
  transactions,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const groups = groupByDate(transactions);

  return (
    <div className="flex flex-col gap-4">
      {Array.from(groups).map(([date, txns]) => (
        <div key={date} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {formatDateLabel(date)}
          </h3>
          <div className="flex flex-col gap-2">
            {txns.map((txn) => (
              <TransactionItem
                key={txn.id}
                transaction={txn}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
