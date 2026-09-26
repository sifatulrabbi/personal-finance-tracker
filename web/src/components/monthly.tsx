import { useState } from "react";
import { useMonthly } from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { dhakaDate } from "@/lib/dates";
import { moneyLabel } from "@/money/format";
import { MoneyField, SaveForm, TextField } from "@/components/forms";
import { LoadError, PageHeading } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

export function Monthly() {
  const writes = useWrites();
  const [month, setMonth] = useState(dhakaDate().slice(0, 7));
  const [saved, setSaved] = useState(false);
  const query = useMonthly(month);
  // While another month loads, the previous month stays on screen (never a blank page).
  const data = query.data;
  const validMonth = /^\d{4}-\d{2}$/.test(month);
  return (
    <div className="flex flex-col gap-4">
      <PageHeading>Monthly spending</PageHeading>
      <TextField
        label="Month"
        name="month"
        type="month"
        min="1900-01"
        max="9999-12"
        value={month}
        onChange={(event) => {
          setMonth(event.target.value);
          setSaved(false);
        }}
      />
      {!validMonth ? (
        <p role="alert" className="text-sm text-destructive">
          Enter a month as YYYY-MM.
        </p>
      ) : null}
      <LoadError
        error={query.error}
        hasData={Boolean(data)}
        onRetry={() => void query.refetch()}
        what="this month"
      />
      {!data && query.isPending && validMonth ? (
        <Skeleton data-testid="monthly-skeleton" className="h-40 w-full" />
      ) : null}
      {data && (
        <div
          data-testid="monthly-content"
          aria-busy={query.isPlaceholderData}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-muted-foreground">
            Actual expenses in BDT · Asia/Dhaka
          </p>
          <p
            data-testid="monthly-total"
            className="text-2xl font-semibold whitespace-nowrap tabular-nums"
          >
            {moneyLabel(data.spent, "BDT")}
          </p>
          {/* Keyed by month only, so a save or a background refresh never remounts the
              form and drops focus. The version is read at submit time. */}
          <SaveForm
            key={data.month}
            label="Save target"
            disabled={query.isPlaceholderData}
            onSaved={() => setSaved(true)}
            body={(form) => ({
              amount: form.decimal("target"),
              version: data.target.version,
            })}
            send={(body, key) => writes.setMonthlyTarget(data.month, body, { key })}
          >
            <MoneyField
              label="Monthly target (BDT)"
              name="target"
              defaultValue={data.target.amount}
              onChange={() => setSaved(false)}
              placeholder="No target set"
            />
          </SaveForm>
          {/* Loaded data stays on screen during refetches, so this never flickers. */}
          {saved && <p role="status">Target saved.</p>}
          <p className="text-sm text-muted-foreground">
            Each share is a percentage of actual spending, not the target. USD
            expenses use their saved exchange rates.
          </p>
          <dl
            data-testid="monthly-mobile-list"
            className="flex min-w-0 flex-col sm:hidden"
          >
            {data.categories.map((category) => (
              <div
                key={category.category_id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b py-3"
              >
                <dt className="min-w-0 whitespace-pre-wrap break-words font-medium">
                  {category.name}
                </dt>
                <dd className="text-right font-medium whitespace-nowrap tabular-nums">
                  {moneyLabel(category.spent, "BDT")}
                </dd>
                <dd className="col-span-2 text-sm text-muted-foreground">
                  {category.percentage}% of monthly spending
                </dd>
              </div>
            ))}
          </dl>
          <div
            data-testid="monthly-table"
            className="hidden min-w-0 max-w-full overflow-x-auto sm:block"
          >
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">
                Expense categories for {data.month}
              </caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="w-2/5 py-3 text-left">
                    Category
                  </th>
                  <th scope="col" className="py-3 text-right">
                    Spent
                  </th>
                  <th scope="col" className="w-1/4 py-3 text-right">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((category) => (
                  <tr key={category.category_id} className="border-b">
                    <th
                      scope="row"
                      className="whitespace-pre-wrap break-words py-3 pr-2 text-left font-normal"
                    >
                      {category.name}
                    </th>
                    <td className="py-3 text-right whitespace-nowrap tabular-nums">
                      {moneyLabel(category.spent, "BDT")}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {category.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.spent === "0.00" && (
            <p className="text-sm text-muted-foreground">
              No expenses recorded this month.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
