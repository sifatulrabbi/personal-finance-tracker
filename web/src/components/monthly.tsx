import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Pencil } from "lucide-react";
import type { MonthlySpending } from "@/api/types";
import { useMonthly } from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { dhakaDate, monthLabel, monthName, shiftMonth } from "@/lib/dates";
import { compareDecimal, fillPercent, subtractDecimal } from "@/money/compare";
import { isZero } from "@/money/format";
import { MoneyField, SaveForm } from "@/components/forms";
import { List, LoadError, Meter, Modal, PageIntro, Section, useEditor } from "@/components/layout";
import { Money } from "@/components/money";
import { dismissSaved } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const targetSaved = "monthly-target-saved";

export function Monthly() {
  const [month, setMonth] = useState(dhakaDate().slice(0, 7));
  const query = useMonthly(month);
  // While another month loads, the previous month stays on screen (never a blank page).
  const data = query.data;
  const choose = (next: string) => {
    setMonth(next);
    dismissSaved(targetSaved);
  };
  return (
    <>
      <PageIntro description="Actual expenses in BDT, by Asia/Dhaka calendar month." />
      <MonthStepper month={month} onChange={choose} />
      <LoadError
        error={query.error}
        hasData={Boolean(data)}
        onRetry={() => void query.refetch()}
        what="this month"
      />
      {!data && query.isPending ? (
        <Skeleton data-testid="monthly-skeleton" className="h-40 w-full rounded-xl" />
      ) : null}
      {data && (
        <div
          data-testid="monthly-content"
          aria-busy={query.isPlaceholderData}
          className={cn(
            "flex flex-col gap-6 transition-opacity",
            query.isPlaceholderData && "opacity-60",
          )}
        >
          <SpendingCard data={data} disabled={query.isPlaceholderData} />
          <Categories data={data} />
        </div>
      )}
    </>
  );
}

// "< September 2026 >" with a picker in the middle. The picker is our own grid of months,
// not a native month input, which WebKit and Firefox do not offer.
function MonthStepper({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const picker = useEditor<true>();
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border bg-card p-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="ghost"
        className="min-w-0 flex-1 text-heading"
        aria-label={`Choose month, ${monthLabel(month)}`}
        onClick={(event) => {
          setYear(Number(month.slice(0, 4)));
          picker.open(true, event);
        }}
      >
        <span data-testid="monthly-month" className="truncate">
          {monthLabel(month)}
        </span>
        <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next month"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
      <Modal
        open={picker.isOpen}
        onClose={picker.close}
        returnFocus={picker.trigger}
        title="Choose a month"
        description="Spending and the target for any Asia/Dhaka calendar month."
      >
        <div className="flex flex-col gap-4 pb-5">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous year"
              disabled={year <= 1900}
              onClick={() => setYear(year - 1)}
            >
              <ChevronLeft />
            </Button>
            <p data-testid="picker-year" aria-live="polite" className="text-heading tabular-nums">
              {year}
            </p>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next year"
              disabled={year >= 9999}
              onClick={() => setYear(year + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, index) => {
              const value = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
              const selected = value === month;
              return (
                <Button
                  key={value}
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  aria-label={monthLabel(value)}
                  onClick={() => {
                    onChange(value);
                    picker.close();
                  }}
                >
                  {monthName(index).slice(0, 3)}
                </Button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SpendingCard({ data, disabled }: { data: MonthlySpending; disabled: boolean }) {
  const writes = useWrites();
  const [editing, setEditing] = useState(false);
  const target = data.target;
  const hasTarget = target.amount !== "";
  const over = hasTarget && compareDecimal(data.spent, target.amount) > 0;
  const difference = hasTarget ? subtractDecimal(target.amount, data.spent) : "";
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-4 px-5 py-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-label text-muted-foreground">Spent</p>
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span data-testid="monthly-total" className="text-display tracking-tight">
              <Money amount={data.spent} currency="BDT" />
            </span>
            {hasTarget ? (
              <span className="text-label font-normal text-muted-foreground">
                of <Money data-testid="monthly-target" amount={target.amount} currency="BDT" /> target
              </span>
            ) : null}
          </p>
        </div>
        {hasTarget ? (
          <div className="flex flex-col gap-2">
            <Meter
              label="Spent against the target"
              percent={fillPercent(data.spent, target.amount)}
              tone={over ? "danger" : "primary"}
            />
            {over ? (
              <p
                data-testid="monthly-over-target"
                className="flex items-center gap-1.5 text-label text-destructive"
              >
                <CircleAlert aria-hidden className="size-4 shrink-0" />
                <span>
                  <Money amount={difference.replace(/^-/, "")} currency="BDT" /> over target
                </span>
              </p>
            ) : (
              <p className="text-label font-normal text-muted-foreground">
                <Money amount={difference} currency="BDT" /> left
              </p>
            )}
          </div>
        ) : null}
        {target.inherited_from ? (
          <p data-testid="inherited-hint" className="text-label font-normal text-muted-foreground">
            Target carried over from {monthLabel(target.inherited_from)}. Saving one here sets{" "}
            {monthLabel(data.month)}'s own target.
          </p>
        ) : null}
        {editing ? (
          // Keyed by month only, so a background refresh never remounts the form and drops
          // focus. The version is read at submit time.
          <div className="border-t pt-4">
            <SaveForm
              key={data.month}
              label="Save target"
              saved={{ message: "Target saved.", id: targetSaved }}
              disabled={disabled}
              onSaved={() => setEditing(false)}
              secondary={
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              }
              body={(form) => ({
                amount: form.decimal("target"),
                version: data.target.version,
              })}
              send={(body, key) => writes.setMonthlyTarget(data.month, body, { key })}
            >
              <MoneyField
                label="Monthly target (BDT)"
                name="target"
                currency="BDT"
                defaultValue={target.amount}
                // The confirmation no longer matches the field once it is edited.
                onChange={() => dismissSaved(targetSaved)}
                placeholder="No target set"
                hint="Zero is allowed. A target is a guide, not a limit on recording expenses."
              />
            </SaveForm>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={disabled}
            onClick={() => {
              setEditing(true);
            }}
          >
            <Pencil data-icon="inline-start" />
            {hasTarget ? "Edit target" : "Set target"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Categories by spending, largest first, each with its share of the month's actual
// spending as the server computed it. Unused categories fold away.
function Categories({ data }: { data: MonthlySpending }) {
  const [showUnused, setShowUnused] = useState(false);
  const sorted = [...data.categories].sort((a, b) => compareDecimal(b.spent, a.spent));
  const used = sorted.filter((category) => !isZero(category.spent));
  const unused = sorted.filter((category) => isZero(category.spent));
  return (
    <Section title="By category">
      <p className="text-sm text-muted-foreground">
        Each share is a percentage of actual spending, not the target. USD expenses use their
        saved exchange rates.
      </p>
      {used.length ? (
        <List data-testid="monthly-categories">
          {used.map((category) => (
            <CategoryRow key={category.category_id} {...category} />
          ))}
        </List>
      ) : (
        <p className="text-sm text-muted-foreground">No expenses recorded this month.</p>
      )}
      {unused.length ? (
        <>
          <Button
            variant="ghost"
            className="self-start text-muted-foreground"
            aria-expanded={showUnused}
            onClick={() => setShowUnused(!showUnused)}
          >
            {showUnused ? <ChevronDown data-icon="inline-start" /> : <ChevronRight data-icon="inline-start" />}
            {showUnused ? "Hide" : "Show"} {unused.length} unused{" "}
            {unused.length === 1 ? "category" : "categories"}
          </Button>
          {showUnused ? (
            <List data-testid="monthly-unused">
              {unused.map((category) => (
                <CategoryRow key={category.category_id} {...category} />
              ))}
            </List>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

function CategoryRow({
  name,
  spent,
  percentage,
}: {
  name: string;
  spent: string;
  percentage: string;
}): ReactNode {
  return (
    <div data-testid="monthly-category" className="flex min-w-0 flex-col gap-2 px-4 py-3">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className="min-w-0 break-words whitespace-pre-wrap font-medium">{name}</p>
        <p className="flex shrink-0 items-baseline gap-2">
          <Money className="font-medium" amount={spent} currency="BDT" />
          <span className="w-16 text-right text-label font-normal text-muted-foreground tabular-nums">
            {percentage}%
          </span>
        </p>
      </div>
      {/* The share is the server's percentage; it is only used as the bar's width here. */}
      <Meter label={`${name} share of spending`} percent={Number.parseFloat(percentage) || 0} />
    </div>
  );
}
