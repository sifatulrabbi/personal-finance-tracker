import { useState } from "react";
import { api, type Settings as SettingsData, type User } from "@/lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SaveForm, TextField, ErrorMessage, value } from "@/components/forms";
import { CategorySettings } from "@/components/categories";
import type { Category } from "@/lib/api";

type Audit = {
  id: number;
  actor_email: string;
  action: string;
  before: unknown;
  after: unknown;
  created_at: string;
};
export function Settings({
  settings,
  categories,
  user,
  onSaved,
}: {
  settings: SettingsData;
  categories: Category[];
  user: User;
  onSaved: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  async function loadAudit() {
    setBusy(true);
    setError("");
    try {
      const rows = await api<Audit[]>(
        `/audit?limit=50&offset=${audit?.length ?? 0}`,
      );
      setAudit((previous) => [...(previous ?? []), ...rows]);
      setMore(rows.length === 50);
    } catch {
      setError("Could not load the change log. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Household settings</h2>
      <CategorySettings categories={categories} onSaved={onSaved} />
      <Card>
        <CardHeader>
          <CardTitle>Currency conversion</CardTitle>
          <CardDescription>
            BDT is the default. USD records use this rate unless you enter
            another rate for that transaction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SaveForm
            key={settings.version}
            path="/settings"
            method="PUT"
            label="Save settings"
            onSaved={() => {
              setSaved(true);
              onSaved();
            }}
            body={(form) => ({
              rate: value(form, "rate"),
              version: settings.version,
            })}
          >
            <TextField
              label="Default exchange rate (BDT per USD)"
              name="rate"
              type="number"
              step="0.000001"
              min="0.000001"
              inputMode="decimal"
              defaultValue={settings.rate}
              onChange={() => setSaved(false)}
              placeholder="For example, 125.00"
              required
            />
            <p className="text-sm text-muted-foreground">
              Existing records keep their saved rates. No live exchange-rate
              service is used.
            </p>
          </SaveForm>
        </CardContent>
      </Card>
      {saved ? (
        <Alert role="status">
          <AlertDescription>Settings saved.</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Your household account</CardTitle>
          <CardDescription>
            Access is controlled through the server's ENV configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>{user.name}</p>
          <p className="break-all text-muted-foreground">{user.email}</p>
          <p>Timezone: Asia/Dhaka</p>
        </CardContent>
      </Card>
      <h3 className="font-semibold">Change log</h3>
      <p className="text-sm text-muted-foreground">
        Wallet, schedule, and settings changes. Open an Activity record for its
        transaction history.
      </p>
      <ErrorMessage error={error} />
      {audit?.map((event) => (
        <details
          key={event.id}
          className="rounded-lg border bg-card p-3 text-sm"
        >
          <summary className="cursor-pointer break-words">
            {event.action} · {event.actor_email}
            <span className="block text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString("en-US", {
                timeZone: "Asia/Dhaka",
              })}
            </span>
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <p className="font-medium">Previous value</p>
            <pre className="whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(event.before, null, 2)}
            </pre>
            <p className="font-medium">New value</p>
            <pre className="whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(event.after, null, 2)}
            </pre>
          </div>
        </details>
      ))}
      {more ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void loadAudit()}
        >
          {busy ? "Loading…" : audit ? "Load older changes" : "View change log"}
        </Button>
      ) : null}
    </section>
  );
}
