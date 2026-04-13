"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { convertToBdt } from "@/libs/currency";
import { formatCurrency } from "@/libs/format";
import { useAccountStore } from "@/providers/account-store-provider";
import { useCategoryStore } from "@/providers/category-store-provider";
import { useCurrencyStore } from "@/providers/currency-store-provider";
import { useOriginStore } from "@/providers/origin-store-provider";
import { usePersonStore } from "@/providers/person-store-provider";
import { useTransactionStore } from "@/providers/transaction-store-provider";
import type { Transaction } from "@/stores/transaction-store";

import { CreatableCombobox } from "./creatable-combobox";

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

export function IncomeDrawer({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
}) {
  const { householdId } = useSession();
  const createIncome = useTransactionStore((s) => s.createIncome);
  const updateTransaction = useTransactionStore((s) => s.updateTransaction);
  const people = usePersonStore((s) => s.people);
  const accounts = useAccountStore((s) => s.accounts);
  const categories = useCategoryStore((s) => s.categories);
  const fetchCategories = useCategoryStore((s) => s.fetchCategories);
  const origins = useOriginStore((s) => s.origins);
  const fetchOrigins = useOriginStore((s) => s.fetchOrigins);
  const currencies = useCurrencyStore((s) => s.currencies);

  const isEdit = !!transaction;

  const [personId, setPersonId] = useState(transaction?.personId ?? "");
  const [accountId, setAccountId] = useState(transaction?.accountId ?? "");
  const [categoryValue, setCategoryValue] = useState(
    transaction?.categoryId ?? "",
  );
  const [categoryIsNew, setCategoryIsNew] = useState(false);
  const [originValue, setOriginValue] = useState(transaction?.originId ?? "");
  const [originIsNew, setOriginIsNew] = useState(false);
  const [amount, setAmount] = useState(
    transaction ? (transaction.originalAmountMinor / 100).toFixed(2) : "",
  );
  const [currencyCode, setCurrencyCode] = useState(
    transaction?.originalCurrencyCode ?? "BDT",
  );
  const [transactionDate, setTransactionDate] = useState(
    transaction?.transactionDate ?? getTodayString(),
  );
  const [description, setDescription] = useState(
    transaction?.description ?? "",
  );
  const [resetKey, setResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (categories.length === 0) fetchCategories(householdId);
      if (origins.length === 0) fetchOrigins(householdId);
    }
  }, [
    open,
    categories.length,
    origins.length,
    fetchCategories,
    fetchOrigins,
    householdId,
  ]);

  function resetForm() {
    setPersonId(transaction?.personId ?? "");
    setAccountId(transaction?.accountId ?? "");
    setCategoryValue(transaction?.categoryId ?? "");
    setCategoryIsNew(false);
    setOriginValue(transaction?.originId ?? "");
    setOriginIsNew(false);
    setAmount(
      transaction ? (transaction.originalAmountMinor / 100).toFixed(2) : "",
    );
    setCurrencyCode(transaction?.originalCurrencyCode ?? "BDT");
    setTransactionDate(transaction?.transactionDate ?? getTodayString());
    setDescription(transaction?.description ?? "");
    setResetKey((k) => k + 1);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  const isValid =
    personId &&
    accountId &&
    categoryValue.trim() &&
    originValue.trim() &&
    amount &&
    transactionDate;

  const selectedCurrency = currencies.find((c) => c.code === currencyCode);
  const parsedAmount = parseFloat(amount);
  const showConversion =
    currencyCode !== "BDT" &&
    selectedCurrency &&
    !isNaN(parsedAmount) &&
    parsedAmount > 0;
  const bdtPreview = showConversion
    ? formatCurrency(
        convertToBdt(
          Math.round(parsedAmount * 100),
          selectedCurrency.rateToBdtMinor,
        ),
      )
    : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      const input = {
        accountId,
        personId,
        ...(categoryIsNew
          ? { categoryName: categoryValue.trim() }
          : { categoryId: categoryValue }),
        ...(originIsNew
          ? { originName: originValue.trim() }
          : { originId: originValue }),
        amount,
        currency: currencyCode,
        transactionDate,
        description: description.trim() || undefined,
      };

      if (isEdit && transaction) {
        await updateTransaction(householdId, transaction.id, input);
        toast.success("Income updated");
      } else {
        await createIncome(householdId, input);
        toast.success("Income recorded");
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
          <DrawerTitle>{isEdit ? "Edit Income" : "New Income"}</DrawerTitle>
          <DrawerDescription>
            {isEdit ? "Update this income." : "Record a new income."}
          </DrawerDescription>
        </DrawerHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>Person</Label>
            <Select
              value={personId}
              items={people.map((p) => ({ value: p.id, label: p.name }))}
              onValueChange={(v) => setPersonId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select person" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Account</Label>
            <Select
              value={accountId}
              items={accounts.map((a) => ({ value: a.id, label: a.name }))}
              onValueChange={(v) => setAccountId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CreatableCombobox
            key={`cat-${resetKey}`}
            label="Category"
            placeholder="Search or create category..."
            items={categories}
            value={categoryValue}
            isNew={categoryIsNew}
            onSelect={(val, isNew) => {
              setCategoryValue(val);
              setCategoryIsNew(isNew);
            }}
          />

          <CreatableCombobox
            key={`org-${resetKey}`}
            label="Origin"
            placeholder="Search or create origin..."
            items={origins}
            value={originValue}
            isNew={originIsNew}
            onSelect={(val, isNew) => {
              setOriginValue(val);
              setOriginIsNew(isNew);
            }}
          />

          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="income-amount">Amount</Label>
              <Input
                id="income-amount"
                placeholder="0.00"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Currency</Label>
              <Select
                value={currencyCode}
                items={currencies.map((c) => ({
                  value: c.code,
                  label: c.code,
                }))}
                onValueChange={(v) => setCurrencyCode(v ?? "BDT")}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.id} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {showConversion && (
            <p className="-mt-2 text-xs text-muted-foreground">
              = {bdtPreview} at 1 {currencyCode} ={" "}
              {(selectedCurrency.rateToBdtMinor / 100).toFixed(2)} BDT
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="income-date">Date</Label>
            <Input
              id="income-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="income-description">Description</Label>
            <Textarea
              id="income-description"
              placeholder="Optional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <DrawerFooter className="px-0">
            <Button type="submit" disabled={submitting || !isValid}>
              {submitting && <Spinner />}
              {isEdit ? "Save Changes" : "Record Income"}
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
