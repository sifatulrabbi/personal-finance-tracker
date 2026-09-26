import { useState } from "react";
import type { User } from "@/api/types";
import { useAudit, useCategories, useSettings } from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RateField, SaveForm } from "@/components/forms";
import { LoadError, PageHeading } from "@/components/layout";
import { CategorySettings } from "@/components/categories";

export function Settings({ user }: { user: User }) {
  const writes = useWrites();
  const settingsQuery = useSettings();
  const categoriesQuery = useCategories();
  const settings = settingsQuery.data;
  const [saved, setSaved] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const audit = useAudit(showAudit);
  const events = audit.data?.pages.flat() ?? [];
  return (
    <section className="flex flex-col gap-4">
      <PageHeading>Household settings</PageHeading>
      <LoadError
        error={categoriesQuery.error}
        hasData={Boolean(categoriesQuery.data)}
        onRetry={() => void categoriesQuery.refetch()}
        what="categories"
      />
      {categoriesQuery.data ? (
        <CategorySettings categories={categoriesQuery.data} />
      ) : categoriesQuery.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Currency conversion</CardTitle>
          <CardDescription>
            BDT is the default. USD records use this rate unless you enter
            another rate for that transaction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoadError
            error={settingsQuery.error}
            hasData={Boolean(settings)}
            onRetry={() => void settingsQuery.refetch()}
            what="settings"
          />
          {settings ? (
            // Not keyed by version: saving keeps the field and its focus. The version is
            // read from the latest settings at submit time.
            <SaveForm
              label="Save settings"
              onSaved={() => setSaved(true)}
              body={(form) => ({
                rate: form.decimal("rate"),
                version: settings.version,
              })}
              send={(body, key) => writes.updateSettings(body, { key })}
            >
              <RateField
                label="Default exchange rate (BDT per USD)"
                name="rate"
                defaultValue={settings.rate}
                onChange={() => setSaved(false)}
                placeholder="For example, 125.00"
              />
              <p className="text-sm text-muted-foreground">
                Existing records keep their saved rates. No live exchange-rate
                service is used.
              </p>
            </SaveForm>
          ) : settingsQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : null}
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
          <p>Timezone: {settings?.timezone ?? "Asia/Dhaka"}</p>
        </CardContent>
      </Card>
      <h3 className="font-semibold">Change log</h3>
      <p className="text-sm text-muted-foreground">
        Wallet, schedule, and settings changes. Open an Activity record for its
        transaction history.
      </p>
      <LoadError
        error={audit.error}
        hasData={Boolean(audit.data)}
        onRetry={() => void audit.refetch()}
        what="the change log"
      />
      {events.map((event) => (
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
      {!showAudit || audit.hasNextPage ? (
        <Button
          variant="outline"
          disabled={audit.isFetching}
          onClick={() => (showAudit ? void audit.fetchNextPage() : setShowAudit(true))}
        >
          {audit.isFetching ? "Loading…" : showAudit ? "Load older changes" : "View change log"}
        </Button>
      ) : null}
    </section>
  );
}
