"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccountStore } from "@/providers/account-store-provider";
import { useCategoryStore } from "@/providers/category-store-provider";
import { usePersonStore } from "@/providers/person-store-provider";
import { useTransactionStore } from "@/providers/transaction-store-provider";

export function TransactionFilters() {
  const filters = useTransactionStore((s) => s.filters);
  const setFilters = useTransactionStore((s) => s.setFilters);
  const people = usePersonStore((s) => s.people);
  const accounts = useAccountStore((s) => s.accounts);
  const categories = useCategoryStore((s) => s.categories);

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2">
      <Select
        value={filters.personId}
        items={[
          { value: "", label: "All People" },
          ...people.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onValueChange={(v) => setFilters({ personId: v ?? "" })}
      >
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue placeholder="Person" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All People</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.accountId}
        items={[
          { value: "", label: "All Accounts" },
          ...accounts.map((a) => ({ value: a.id, label: a.name })),
        ]}
        onValueChange={(v) => setFilters({ accountId: v ?? "" })}
      >
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue placeholder="Account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.categoryId}
        items={[
          { value: "", label: "All Categories" },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
        onValueChange={(v) => setFilters({ categoryId: v ?? "" })}
      >
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
