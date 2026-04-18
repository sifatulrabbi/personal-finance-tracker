"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/libs/utils";
import {
  defaultValuesFor,
  defaultValuesFromTransaction,
} from "@/libs/client/transaction-form";
import {
  toCreateExpenseInput,
  toCreateIncomeInput,
  toCreateTransferInput,
  toUpdateTransactionInput,
  transactionFormSchema,
  type TransactionFormValues,
  type TransactionType,
} from "@/libs/client/transaction-schemas";
import { useAccountStore } from "@/providers/account-store-provider";
import { useCategoryStore } from "@/providers/category-store-provider";
import { useCurrencyStore } from "@/providers/currency-store-provider";
import { useOriginStore } from "@/providers/origin-store-provider";
import { usePersonStore } from "@/providers/person-store-provider";
import { useTransactionStore } from "@/providers/transaction-store-provider";
import type { Transaction } from "@/stores/transaction-store";

import { CreatableCombobox } from "./creatable-combobox";
import { CurrencyAmountField } from "./currency-amount-field";

type SubmitValues = TransactionFormValues;

/**
 * Unified sheet used for creating and editing transactions. Handles three
 * variants (expense/income/transfer) via a discriminated Zod schema driven
 * by react-hook-form. Used on both the transactions page and the accounts
 * page (the latter sets `defaultType="transfer"`).
 *
 * Editing is only permitted for expense and income — the backend forbids
 * editing transfers, so callers should not open this in edit mode for a
 * transfer row.
 */
export function TransactionSheet({
  open,
  onOpenChange,
  transaction,
  defaultType = "expense",
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  transaction?: Transaction | null;
  defaultType?: TransactionType;
}) {
  const { householdId } = useSession();
  const isEdit = !!transaction;

  // Store selectors
  const people = usePersonStore((s) => s.people);
  const accounts = useAccountStore((s) => s.accounts);
  const categories = useCategoryStore((s) => s.categories);
  const origins = useOriginStore((s) => s.origins);
  const currencies = useCurrencyStore((s) => s.currencies);

  const fetchCategories = useCategoryStore((s) => s.fetchCategories);
  const fetchOrigins = useOriginStore((s) => s.fetchOrigins);
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);

  const createExpense = useTransactionStore((s) => s.createExpense);
  const createIncome = useTransactionStore((s) => s.createIncome);
  const createTransfer = useTransactionStore((s) => s.createTransfer);
  const updateTransaction = useTransactionStore((s) => s.updateTransaction);

  // Form setup — default values depend on edit vs create and the chosen type.
  const form = useForm<SubmitValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: transaction
      ? defaultValuesFromTransaction(transaction)
      : defaultValuesFor(defaultType),
  });

  const type = form.watch("type");
  // Watch source so the destination dropdown re-renders when source changes
  // and we can auto-clear a destination that collides with the new source.
  const sourceAccountId = form.watch("sourceAccountId") as string | undefined;
  const destinationAccountId = form.watch("destinationAccountId") as
    | string
    | undefined;

  // Re-sync form state when the sheet opens or the edit target changes.
  useEffect(() => {
    if (!open) return;
    form.reset(
      transaction
        ? defaultValuesFromTransaction(transaction)
        : defaultValuesFor(defaultType),
    );
    // form is stable across renders; deps intentionally narrow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction?.id, defaultType]);

  // If the user picks a source that matches the current destination, clear
  // the destination so the two never represent the same account.
  useEffect(() => {
    if (type !== "transfer") return;
    if (!sourceAccountId) return;
    if (destinationAccountId !== sourceAccountId) return;
    form.setValue("destinationAccountId" as never, "" as never, {
      shouldValidate: false,
    });
    // form is stable; dep list intentionally narrow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, sourceAccountId, destinationAccountId]);

  // Lazy-fetch lookups the first time the sheet opens.
  useEffect(() => {
    if (!open) return;
    if (categories.length === 0) fetchCategories(householdId);
    if (origins.length === 0) fetchOrigins(householdId);
  }, [
    open,
    householdId,
    categories.length,
    origins.length,
    fetchCategories,
    fetchOrigins,
  ]);

  function handleTypeTabChange(next: unknown) {
    if (isEdit) return;
    if (typeof next !== "string") return;
    if (next !== "expense" && next !== "income" && next !== "transfer") return;
    form.reset(defaultValuesFor(next));
  }

  async function onSubmit(values: SubmitValues) {
    try {
      if (isEdit && transaction && values.type !== "transfer") {
        await updateTransaction(
          householdId,
          transaction.id,
          toUpdateTransactionInput(values),
        );
        toast.success(
          values.type === "expense" ? "Expense updated" : "Income updated",
        );
      } else {
        switch (values.type) {
          case "expense":
            await createExpense(householdId, toCreateExpenseInput(values));
            toast.success("Expense recorded");
            break;
          case "income":
            await createIncome(householdId, toCreateIncomeInput(values));
            toast.success("Income recorded");
            break;
          case "transfer":
            await createTransfer(householdId, toCreateTransferInput(values));
            // Balances shift for both accounts; keep the account store fresh.
            await fetchAccounts(householdId);
            toast.success("Transfer recorded");
            break;
        }
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const { title, description, submitLabel } = getCopy(type, isEdit);
  const submitting = form.formState.isSubmitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        {!isEdit && (
          <Tabs
            value={type}
            onValueChange={handleTypeTabChange}
            className="px-4"
          >
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="expense">Expense</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="transfer">Transfer</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2"
        >
          <Controller
            control={form.control}
            name="personId"
            render={({ field, fieldState }) => (
              <FieldShell label="Person" error={fieldState.error?.message}>
                <Select
                  value={field.value}
                  items={people.map((p) => ({ value: p.id, label: p.name }))}
                  onValueChange={(v) =>
                    field.onChange(typeof v === "string" ? v : "")
                  }
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
              </FieldShell>
            )}
          />

          {(type === "expense" || type === "income") && (
            <Controller
              control={form.control}
              name="accountId"
              render={({ field, fieldState }) => (
                <FieldShell label="Account" error={fieldState.error?.message}>
                  <Select
                    value={typeof field.value === "string" ? field.value : ""}
                    items={accounts.map((a) => ({
                      value: a.id,
                      label: a.name,
                    }))}
                    onValueChange={(v) =>
                      field.onChange(typeof v === "string" ? v : "")
                    }
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
                </FieldShell>
              )}
            />
          )}

          {type === "transfer" && (
            <>
              <Controller
                control={form.control}
                name="sourceAccountId"
                render={({ field, fieldState }) => (
                  <FieldShell
                    label="From account"
                    error={fieldState.error?.message}
                  >
                    <Select
                      value={typeof field.value === "string" ? field.value : ""}
                      items={accounts.map((a) => ({
                        value: a.id,
                        label: a.name,
                      }))}
                      onValueChange={(v) =>
                        field.onChange(typeof v === "string" ? v : "")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select source account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldShell>
                )}
              />
              <Controller
                control={form.control}
                name="destinationAccountId"
                render={({ field, fieldState }) => {
                  // Filter out the source account. `sourceAccountId` is a
                  // subscribed value (via form.watch above), so this list
                  // reactively refreshes when the user picks a new source.
                  const choices = accounts.filter(
                    (a) => a.id !== sourceAccountId,
                  );
                  return (
                    <FieldShell
                      label="To account"
                      error={fieldState.error?.message}
                    >
                      <Select
                        value={
                          typeof field.value === "string" ? field.value : ""
                        }
                        items={choices.map((a) => ({
                          value: a.id,
                          label: a.name,
                        }))}
                        onValueChange={(v) =>
                          field.onChange(typeof v === "string" ? v : "")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select destination account" />
                        </SelectTrigger>
                        <SelectContent>
                          {choices.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldShell>
                  );
                }}
              />
            </>
          )}

          {(type === "expense" || type === "income") && (
            <Controller
              control={form.control}
              name="categoryRef"
              render={({ field, fieldState }) => (
                <CreatableCombobox
                  label="Category"
                  placeholder="Search or create category..."
                  items={categories}
                  value={(field.value as never) ?? null}
                  onValueChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          )}

          {type === "income" && (
            <Controller
              control={form.control}
              name="originRef"
              render={({ field, fieldState }) => (
                <CreatableCombobox
                  label="Origin"
                  placeholder="Search or create origin..."
                  items={origins}
                  value={(field.value as never) ?? null}
                  onValueChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
          )}

          <Controller
            control={form.control}
            name="amount"
            render={({ field: amountField, fieldState: amountState }) => (
              <Controller
                control={form.control}
                name="currencyCode"
                render={({ field: currencyField }) => (
                  <CurrencyAmountField
                    id="transaction-amount"
                    amount={amountField.value}
                    setAmount={amountField.onChange}
                    currencyCode={currencyField.value}
                    setCurrencyCode={(next) =>
                      currencyField.onChange(next as never)
                    }
                    currencies={currencies}
                    amountError={amountState.error?.message}
                    lockedCurrency={type === "transfer" ? "BDT" : undefined}
                  />
                )}
              />
            )}
          />

          <Controller
            control={form.control}
            name="transactionDate"
            render={({ field, fieldState }) => (
              <FieldShell
                label="Date"
                htmlFor="transaction-date"
                error={fieldState.error?.message}
              >
                <Input
                  id="transaction-date"
                  type="date"
                  value={field.value}
                  onChange={field.onChange}
                  aria-invalid={!!fieldState.error || undefined}
                  className={cn(fieldState.error && "border-destructive")}
                />
              </FieldShell>
            )}
          />

          <Controller
            control={form.control}
            name="description"
            render={({ field }) => (
              <FieldShell label="Description" htmlFor="transaction-description">
                <Textarea
                  id="transaction-description"
                  placeholder="Optional"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  rows={2}
                />
              </FieldShell>
            )}
          />

          <SheetFooter className="px-0">
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner />}
              {submitLabel}
            </Button>
            <SheetClose
              render={
                <Button variant="outline" type="button" disabled={submitting}>
                  Cancel
                </Button>
              }
            />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FieldShell({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function getCopy(type: TransactionType, isEdit: boolean) {
  if (isEdit) {
    if (type === "income") {
      return {
        title: "Edit Income",
        description: "Update this income.",
        submitLabel: "Save Changes",
      };
    }
    return {
      title: "Edit Expense",
      description: "Update this expense.",
      submitLabel: "Save Changes",
    };
  }
  switch (type) {
    case "expense":
      return {
        title: "New Expense",
        description: "Record a new expense.",
        submitLabel: "Record Expense",
      };
    case "income":
      return {
        title: "New Income",
        description: "Record a new income.",
        submitLabel: "Record Income",
      };
    case "transfer":
      return {
        title: "New Transfer",
        description: "Move money between your accounts.",
        submitLabel: "Record Transfer",
      };
  }
}
