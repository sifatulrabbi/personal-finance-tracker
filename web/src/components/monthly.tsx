import { useEffect, useState } from "react";
import { api, dhakaDate, moneyLabel, type MonthlySpending } from "@/lib/api";
import {
  ErrorMessage,
  MoneyField,
  SaveForm,
  TextField,
  value,
} from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function Monthly({ refreshToken }: { refreshToken: unknown }) {
  const [month, setMonth] = useState(dhakaDate().slice(0, 7));
  const [data, setData] = useState<MonthlySpending | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    api<MonthlySpending>(`/monthly?month=${encodeURIComponent(month)}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError("Could not load this month. Please retry.");
      });
    return () => {
      active = false;
    };
  }, [month, revision, refreshToken]);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Monthly spending</h2>
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
      <ErrorMessage error={error} />
      {error && (
        <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
          Retry
        </Button>
      )}
      {!data && !error && month ? <Skeleton className="h-40 w-full" /> : null}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            Actual expenses in BDT · Asia/Dhaka
          </p>
          <p
            data-testid="monthly-total"
            className="text-2xl font-semibold tabular-nums"
          >
            {moneyLabel(data.spent, "BDT")}
          </p>
          <SaveForm
            key={`${data.month}-${data.target.version}`}
            path={`/monthly/${data.month}/target`}
            method="PUT"
            label="Save target"
            onSaved={() => {
              setSaved(true);
              setRevision((v) => v + 1);
            }}
            body={(form) => ({
              amount: value(form, "target"),
              version: data.target.version,
            })}
          >
            <MoneyField
              label="Monthly target (BDT)"
              name="target"
              min="0"
              defaultValue={data.target.amount}
              onChange={() => setSaved(false)}
              placeholder="No target set"
            />
          </SaveForm>
          {saved && <p role="status">Target saved.</p>}
          <p className="text-sm text-muted-foreground">
            Each share is a percentage of actual spending, not the target. USD
            expenses use their saved exchange rates.
          </p>
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
              {data.categories.map((c) => (
                <tr key={c.category_id} className="border-b">
                  <th
                    scope="row"
                    className="whitespace-pre-wrap break-words py-3 pr-2 text-left font-normal"
                  >
                    {c.name}
                  </th>
                  <td className="break-all py-3 text-right tabular-nums">
                    {moneyLabel(c.spent, "BDT")}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {c.percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.spent === "0.00" && (
            <p className="text-sm text-muted-foreground">
              No expenses recorded this month.
            </p>
          )}
        </>
      )}
    </div>
  );
}
