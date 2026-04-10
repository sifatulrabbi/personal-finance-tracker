"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrencyStore } from "@/providers/currency-store-provider";
import type { Currency } from "@/stores/currency-store";

import { CurrencyFormDrawer } from "./currency-form-drawer";

function formatRate(rateToBdtMinor: number): string {
  return (rateToBdtMinor / 100).toFixed(2);
}

export function CurrencySection() {
  const { householdId } = useSession();
  const currencies = useCurrencyStore((s) => s.currencies);
  const loading = useCurrencyStore((s) => s.loading);
  const fetchCurrencies = useCurrencyStore((s) => s.fetchCurrencies);
  const deleteCurrency = useCurrencyStore((s) => s.deleteCurrency);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [deletingCurrency, setDeletingCurrency] = useState<Currency | null>(
    null,
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchCurrencies(householdId);
  }, [fetchCurrencies, householdId]);

  async function handleDelete() {
    if (!deletingCurrency) return;
    setDeleteLoading(true);
    try {
      await deleteCurrency(householdId, deletingCurrency.id);
      toast.success("Currency deleted");
      setDeletingCurrency(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Currencies</h2>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </div>

      {loading && currencies.length === 0 ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {currencies.map((currency) => (
            <Card key={currency.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{currency.symbol}</span>
                  <span>{currency.code}</span>
                  {currency.isBase && (
                    <Badge variant="secondary">Base</Badge>
                  )}
                </CardTitle>
                <CardAction>
                  {!currency.isBase && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditingCurrency(currency)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeletingCurrency(currency)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </CardAction>
              </CardHeader>
              <CardContent className="-mt-2">
                <p className="text-sm text-muted-foreground">
                  {currency.name}
                  {!currency.isBase && (
                    <span>
                      {" "}
                      &middot; 1 {currency.code} = {formatRate(currency.rateToBdtMinor)} BDT
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CurrencyFormDrawer open={createOpen} onOpenChange={setCreateOpen} />

      <CurrencyFormDrawer
        open={!!editingCurrency}
        onOpenChange={(open) => {
          if (!open) setEditingCurrency(null);
        }}
        currency={editingCurrency}
      />

      <ConfirmDialog
        open={!!deletingCurrency}
        onOpenChange={(open) => {
          if (!open) setDeletingCurrency(null);
        }}
        title="Delete Currency"
        description={`Are you sure you want to delete "${deletingCurrency?.code}"? This action cannot be undone.`}
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
    </section>
  );
}
