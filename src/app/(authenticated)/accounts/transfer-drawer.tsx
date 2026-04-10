"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/components/session-provider";
import { useAccountStore } from "@/providers/account-store-provider";
import { usePersonStore } from "@/providers/person-store-provider";
import type { Account } from "@/stores/account-store";

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

export function TransferDrawer({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}) {
  const { householdId } = useSession();
  const fetchAccounts = useAccountStore((s) => s.fetchAccounts);
  const people = usePersonStore((s) => s.people);
  const fetchPeople = usePersonStore((s) => s.fetchPeople);

  const [sourceAccountId, setSourceAccountId] = useState<string>("");
  const [destinationAccountId, setDestinationAccountId] = useState<string>("");
  const [personId, setPersonId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(getTodayString());
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && people.length === 0) {
      fetchPeople(householdId);
    }
  }, [open, people.length, fetchPeople, householdId]);

  function resetForm() {
    setSourceAccountId("");
    setDestinationAccountId("");
    setPersonId("");
    setAmount("");
    setTransactionDate(getTodayString());
    setDescription("");
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  const destinationAccounts = accounts.filter((a) => a.id !== sourceAccountId);

  const isValid =
    sourceAccountId &&
    destinationAccountId &&
    personId &&
    amount &&
    transactionDate;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/households/${householdId}/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAccountId,
          destinationAccountId,
          personId,
          amount,
          transactionDate,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `Transfer failed (${res.status})`,
        );
      }

      toast.success("Transfer completed");
      await fetchAccounts(householdId);
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
          <DrawerTitle>Transfer Money</DrawerTitle>
          <DrawerDescription>
            Move money between your accounts.
          </DrawerDescription>
        </DrawerHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>From Account</Label>
            <Select
              value={sourceAccountId}
              onValueChange={(v) => setSourceAccountId(v ?? "")}
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>To Account</Label>
            <Select
              value={destinationAccountId}
              onValueChange={(v) => setDestinationAccountId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select destination account" />
              </SelectTrigger>
              <SelectContent>
                {destinationAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Person</Label>
            <Select
              value={personId}
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
            <Label htmlFor="transfer-amount">Amount</Label>
            <Input
              id="transfer-amount"
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-date">Date</Label>
            <Input
              id="transfer-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-description">Description</Label>
            <Textarea
              id="transfer-description"
              placeholder="Optional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <DrawerFooter className="px-0">
            <Button type="submit" disabled={submitting || !isValid}>
              {submitting && <Spinner />}
              Transfer
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
