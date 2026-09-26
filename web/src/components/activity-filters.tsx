import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import type { Category, Wallet } from "@/api/types";
import {
  compact,
  hasFilters,
  monthRange,
  rangeLabel,
  type ActivityFilters,
  type ActivityKind,
} from "@/activity/filters";
import { dhakaDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, useEditor } from "@/components/layout";
import { ChipButton, Segmented } from "@/components/pickers";

const kindOptions = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
];

const chip =
  "h-11 max-w-[11rem] shrink-0 cursor-pointer appearance-none truncate rounded-full border bg-card pr-8 pl-3.5 text-base font-medium outline-none transition-[color,background-color,border-color,box-shadow] hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 pointer-fine:h-9 pointer-fine:text-sm";
const activeChip = "border-primary bg-primary/10 text-primary hover:bg-primary/15";

// A native select dressed as a chip: the phone's own picker opens on tap.
function FilterSelect({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(chip, value && activeChip)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-70"
      />
    </div>
  );
}

// Kind chips, then wallet, category and date range. Every change is written to the URL by
// the page, so the list survives a refresh and can be linked.
export function ActivityFilterBar({
  filters,
  wallets,
  categories,
  onChange,
}: {
  filters: ActivityFilters;
  wallets: Wallet[];
  categories: Category[];
  onChange: (filters: ActivityFilters) => void;
}) {
  const [today] = useState(() => dhakaDate());
  const dates = useEditor<true>();
  const set = (patch: Partial<ActivityFilters>) => onChange(compact({ ...filters, ...patch }));
  const kind = filters.kind;
  const categoryTypes = kind === "expense" || kind === "income" ? [kind] : (["expense", "income"] as const);
  const walletList = [...wallets.filter((w) => !w.archived), ...wallets.filter((w) => w.archived)];
  return (
    <div className="flex min-w-0 flex-col gap-3" role="search" aria-label="Filter records">
      <Segmented
        legend="Record type"
        field="kind"
        value={kind ?? "all"}
        onChange={(value) => {
          const next = value === "all" ? undefined : (value as ActivityKind);
          const category = categories.find((c) => c.id === filters.category);
          // A category of another type, or any category for transfers, cannot match anything.
          const keepCategory = next !== "transfer" && (!next || !category || category.type === next);
          set({ kind: next, category: keepCategory ? filters.category : undefined });
        }}
        options={kindOptions}
      />
      {/* One row that scrolls sideways on narrow phones instead of stacking three rows. */}
      <div className="-mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
        <FilterSelect label="Filter by wallet" value={filters.wallet ?? ""} onChange={(wallet) => set({ wallet })}>
          <option value="">All wallets</option>
          {walletList.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name}
              {wallet.archived ? " (archived)" : ""}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Filter by category"
          value={filters.category ?? ""}
          disabled={kind === "transfer"}
          onChange={(category) => set({ category })}
        >
          <option value="">All categories</option>
          {categoryTypes.map((type) => (
            <optgroup key={type} label={type === "expense" ? "Expense" : "Income"}>
              {categories
                .filter((c) => c.type === type)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </FilterSelect>
        <button
          type="button"
          className={cn(chip, "inline-flex items-center gap-1.5 pr-3.5", (filters.from || filters.to) && activeChip)}
          aria-label={`Date range: ${rangeLabel(filters, today)}`}
          onClick={(event) => dates.open(true, event)}
        >
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{rangeLabel(filters, today)}</span>
        </button>
        {hasFilters(filters) ? (
          <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => onChange({})}>
            <X data-icon="inline-start" />
            Clear filters
          </Button>
        ) : null}
      </div>
      <Modal
        open={dates.isOpen}
        onClose={dates.close}
        returnFocus={dates.trigger}
        title="Date range"
        description="Show records dated within these days (Asia/Dhaka)."
      >
        {dates.value ? (
          <DateRangeForm
            today={today}
            from={filters.from}
            to={filters.to}
            onApply={(range) => {
              set(range);
              dates.close();
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function DateRangeForm({
  today,
  from: initialFrom,
  to: initialTo,
  onApply,
}: {
  today: string;
  from?: string;
  to?: string;
  onApply: (range: { from?: string; to?: string }) => void;
}) {
  const id = useId();
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");
  const presets = [
    { label: "This month", range: monthRange(today) },
    { label: "Last month", range: monthRange(today, -1) },
  ];
  return (
    <form
      data-sheet-form=""
      onSubmit={(event) => {
        event.preventDefault();
        // A reversed range is applied the way it was meant.
        const [start, end] = from && to && from > to ? [to, from] : [from, to];
        onApply({ from: start || undefined, to: end || undefined });
      }}
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <ChipButton
              key={preset.label}
              pressed={from === preset.range.from && to === preset.range.to}
              onClick={() => {
                setFrom(preset.range.from);
                setTo(preset.range.to);
              }}
            >
              {preset.label}
            </ChipButton>
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 min-[360px]:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-from`} className="text-label">
              From
            </label>
            <Input id={`${id}-from`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-to`} className="text-label">
              To
            </label>
            <Input id={`${id}-to`} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
      </div>
      <div
        data-slot="sheet-footer"
        className="sticky bottom-0 z-10 -mx-4 mt-5 flex gap-3 border-t bg-card px-4 py-3 sm:-mx-5 sm:px-5"
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={() => onApply({ from: undefined, to: undefined })}
        >
          Any date
        </Button>
        <Button type="submit" size="lg" className="flex-1">
          Apply dates
        </Button>
      </div>
    </form>
  );
}
