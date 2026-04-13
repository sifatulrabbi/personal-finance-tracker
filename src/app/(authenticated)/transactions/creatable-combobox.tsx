"use client";

import { useState } from "react";
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

type Item = { id: string; name: string };

export function CreatableCombobox({
  items,
  value,
  isNew,
  onSelect,
  placeholder,
  label,
}: {
  items: Item[];
  value: string;
  isNew: boolean;
  onSelect: (value: string, isNew: boolean) => void;
  placeholder: string;
  label: string;
}) {
  const matchedItem = !isNew ? items.find((i) => i.id === value) : null;
  const [inputText, setInputText] = useState(
    isNew ? value : (matchedItem?.name ?? ""),
  );

  const trimmedInput = inputText.trim().toLowerCase();
  const exactMatch = items.some(
    (item) => item.name.toLowerCase() === trimmedInput,
  );
  const showCreate = trimmedInput.length > 0 && !exactMatch;

  function handleValueChange(newValue: unknown) {
    const val = typeof newValue === "string" ? newValue : "";
    if (val === "__create__") {
      onSelect(inputText.trim(), true);
    } else if (val === "") {
      setInputText("");
      onSelect("", false);
    } else {
      const item = items.find((i) => i.id === val);
      if (item) {
        setInputText(item.name);
      }
      onSelect(val, false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Combobox value={value} onValueChange={handleValueChange}>
        <ComboboxInput
          placeholder={placeholder}
          showTrigger
          showClear={!!value}
          value={inputText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setInputText(e.target.value)
          }
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
                <ComboboxItem value="__create__">
                  <Plus className="size-3.5 text-muted-foreground" />
                  Create &ldquo;{inputText.trim()}&rdquo;
                </ComboboxItem>
              </>
            )}
          </ComboboxList>
          <ComboboxEmpty>No results found</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
