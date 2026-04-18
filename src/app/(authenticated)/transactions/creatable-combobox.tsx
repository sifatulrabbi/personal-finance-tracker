"use client";

import { Plus } from "lucide-react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { cn } from "@/libs/utils";

type Item = { id: string; name: string };

/**
 * Structured value representing either a committed existing item selection or
 * a "new" item the user intends to create. `null` means nothing is selected.
 */
export type CreatableValue =
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string }
  | null;

const CREATE_SENTINEL = "__create__";

/**
 * A fully-controlled combobox that supports both picking an existing item and
 * creating a brand-new one. The input's shown text is derived from the
 * `value` prop, so the parent is always in sync — no internal text state can
 * drift.
 *
 * Typing into the input provisionally sets the value to `{ kind: "new", ... }`.
 * Clicking a list item swaps to `{ kind: "existing", id }`. Clearing the
 * input (or clicking the clear button) sets the value to `null`.
 */
export function CreatableCombobox({
  items,
  value,
  onValueChange,
  placeholder,
  label,
  error,
  disabled = false,
  id,
}: {
  items: Item[];
  value: CreatableValue;
  onValueChange: (next: CreatableValue) => void;
  placeholder: string;
  label: string;
  error?: string;
  disabled?: boolean;
  id?: string;
}) {
  const displayText = computeDisplayText(value, items);
  const trimmed = displayText.trim();
  const normalizedTrimmed = trimmed.toLowerCase();
  const hasExactMatch = items.some(
    (item) => item.name.toLowerCase() === normalizedTrimmed,
  );
  const showCreate = trimmed.length > 0 && !hasExactMatch;
  // `value` drives the Combobox primitive: existing item → its id, everything
  // else → empty string so no item appears committed.
  const rootValue = value?.kind === "existing" ? value.id : "";

  function handleRootValueChange(next: unknown) {
    const normalized = typeof next === "string" ? next : "";
    if (normalized === CREATE_SENTINEL) {
      onValueChange({ kind: "new", name: trimmed });
      return;
    }
    if (normalized === "") {
      onValueChange(null);
      return;
    }
    const item = items.find((i) => i.id === normalized);
    if (item) onValueChange({ kind: "existing", id: item.id });
  }

  function handleInputEvent(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    // Only treat a truly-empty input as "no value". Whitespace stays in
    // the draft — Zod trims at submit time, so leading/intermediate spaces
    // don't confuse the user mid-typing.
    if (next === "") {
      onValueChange(null);
      return;
    }
    onValueChange({ kind: "new", name: next });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Combobox value={rootValue} onValueChange={handleRootValueChange}>
        <ComboboxInput
          id={id}
          placeholder={placeholder}
          showTrigger
          showClear={displayText.length > 0}
          value={displayText}
          onChange={handleInputEvent}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          className={cn(error && "border-destructive")}
        />
        <ComboboxContent>
          <ComboboxList>
            {items.map((item) => (
              <ComboboxItem key={item.id} value={item.id}>
                {item.name}
              </ComboboxItem>
            ))}
            {showCreate && (
              <>
                <ComboboxSeparator />
                <ComboboxItem value={CREATE_SENTINEL}>
                  <Plus className="size-3.5 text-muted-foreground" />
                  Create &ldquo;{trimmed}&rdquo;
                </ComboboxItem>
              </>
            )}
          </ComboboxList>
          <ComboboxEmpty>No results found</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function computeDisplayText(value: CreatableValue, items: Item[]): string {
  if (value === null) return "";
  if (value.kind === "new") return value.name;
  return items.find((item) => item.id === value.id)?.name ?? "";
}
