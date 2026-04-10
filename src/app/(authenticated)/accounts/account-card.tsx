"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/libs/format";
import { cn } from "@/libs/utils";
import type { Account } from "@/stores/account-store";

export function AccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNegative = account.currentBalanceMinor < 0;

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-card/80"
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader>
        <CardTitle>{account.name}</CardTitle>
        <CardAction>
          <span
            className={cn(
              "text-base font-semibold tabular-nums",
              isNegative ? "text-destructive" : "text-foreground",
            )}
          >
            {formatCurrency(account.currentBalanceMinor)}
          </span>
        </CardAction>
      </CardHeader>

      {account.description && (
        <CardContent className="-mt-2">
          <p className="text-sm text-muted-foreground">{account.description}</p>
        </CardContent>
      )}

      {expanded && (
        <CardContent>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(account);
              }}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(account);
              }}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
