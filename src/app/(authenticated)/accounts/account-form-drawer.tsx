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
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/components/session-provider";
import { useAccountStore } from "@/providers/account-store-provider";
import type { Account } from "@/stores/account-store";

export function AccountFormDrawer({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
}) {
  const { householdId } = useSession();
  const createAccount = useAccountStore((s) => s.createAccount);
  const updateAccount = useAccountStore((s) => s.updateAccount);

  const isEdit = !!account;

  const [name, setName] = useState(account?.name ?? "");
  const [description, setDescription] = useState(account?.description ?? "");
  const [initialBalance, setInitialBalance] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName(account?.name ?? "");
    setDescription(account?.description ?? "");
    setInitialBalance("");
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      if (isEdit && account) {
        await updateAccount(householdId, account.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        });
        toast.success("Account updated");
      } else {
        await createAccount(householdId, {
          name: name.trim(),
          description: description.trim() || undefined,
          initialBalance: initialBalance || "0",
        });
        toast.success("Account created");
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
          <DrawerTitle>{isEdit ? "Edit Account" : "New Account"}</DrawerTitle>
          <DrawerDescription>
            {isEdit
              ? "Update the account details."
              : "Add a new money-holding account."}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              placeholder="e.g. Main Wallet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-description">Description</Label>
            <Textarea
              id="account-description"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account-balance">Initial Balance</Label>
              <Input
                id="account-balance"
                placeholder="0.00"
                inputMode="decimal"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
              />
            </div>
          )}

          <DrawerFooter className="px-0">
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting && <Spinner />}
              {isEdit ? "Save Changes" : "Create Account"}
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
