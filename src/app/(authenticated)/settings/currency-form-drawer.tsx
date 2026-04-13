"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/components/session-provider";
import { useCurrencyStore } from "@/providers/currency-store-provider";
import type { Currency } from "@/stores/currency-store";

export function CurrencyFormDrawer({
  open,
  onOpenChange,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency?: Currency | null;
}) {
  const { householdId } = useSession();
  const createCurrency = useCurrencyStore((s) => s.createCurrency);
  const updateCurrency = useCurrencyStore((s) => s.updateCurrency);

  const isEdit = !!currency;

  const [code, setCode] = useState(currency?.code ?? "");
  const [symbol, setSymbol] = useState(currency?.symbol ?? "");
  const [name, setName] = useState(currency?.name ?? "");
  const [rateToBdt, setRateToBdt] = useState(
    currency ? (currency.rateToBdtMinor / 100).toFixed(2) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setCode(currency?.code ?? "");
    setSymbol(currency?.symbol ?? "");
    setName(currency?.name ?? "");
    setRateToBdt(currency ? (currency.rateToBdtMinor / 100).toFixed(2) : "");
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  const isValid =
    code.trim().length === 3 && symbol.trim() && name.trim() && rateToBdt;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      if (isEdit && currency) {
        await updateCurrency(householdId, currency.id, {
          symbol: symbol.trim(),
          name: name.trim(),
          rateToBdt: rateToBdt.trim(),
        });
        toast.success("Currency updated");
      } else {
        await createCurrency(householdId, {
          code: code.trim().toUpperCase(),
          symbol: symbol.trim(),
          name: name.trim(),
          rateToBdt: rateToBdt.trim(),
        });
        toast.success("Currency created");
      }
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{isEdit ? "Edit Currency" : "Add Currency"}</DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "Update the currency details and exchange rate."
              : "Add a new currency with its exchange rate to BDT."}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-code">Code (ISO 4217)</Label>
            <Input
              id="currency-code"
              placeholder="e.g. USD"
              maxLength={3}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              disabled={isEdit}
              autoFocus={!isEdit}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-symbol">Symbol</Label>
            <Input
              id="currency-symbol"
              placeholder="e.g. $"
              maxLength={5}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-name">Name</Label>
            <Input
              id="currency-name"
              placeholder="e.g. US Dollar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency-rate">Rate to BDT</Label>
            <Input
              id="currency-rate"
              placeholder="e.g. 120.50"
              inputMode="decimal"
              value={rateToBdt}
              onChange={(e) => setRateToBdt(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              1 {code || "___"} = {rateToBdt || "?"} BDT
            </p>
          </div>

          <DrawerFooter className="px-0">
            <Button type="submit" disabled={submitting || !isValid}>
              {submitting && <Spinner />}
              {isEdit ? "Save Changes" : "Add Currency"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" type="button" disabled={submitting}>
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
