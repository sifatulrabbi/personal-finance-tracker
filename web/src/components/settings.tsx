import { ChevronRight, History, LogOut } from "lucide-react";
import { useState } from "react";
import type { Settings as SettingsData, User } from "@/api/types";
import { useAudit, useCategories, useSettings, useWallets } from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { describeAudit } from "@/lib/audit";
import { dhakaDateTime } from "@/lib/dates";
import { rateLabel } from "@/money/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldDescription } from "@/components/ui/field";
import { RateField, SaveForm } from "@/components/forms";
import {
  List,
  ListRow,
  ListSkeleton,
  LoadError,
  Modal,
  PageIntro,
  Section,
  useEditor,
} from "@/components/layout";
import { CategorySettings } from "@/components/categories";
import { ThemeChoice, useSignOut } from "@/components/shell";
import { dismissSaved } from "@/components/feedback";

const settingsSaved = "settings-saved";

export function Settings({ user }: { user: User }) {
  const settingsQuery = useSettings();
  const categoriesQuery = useCategories();
  const settings = settingsQuery.data;
  const rateEditor = useEditor<true>();
  const signOut = useSignOut();
  return (
    <>
      <PageIntro description="Shared by everyone in the household, except the theme." />
      <Section title="Currency">
        <LoadError
          error={settingsQuery.error}
          hasData={Boolean(settings)}
          onRetry={() => void settingsQuery.refetch()}
          what="settings"
        />
        {settings ? (
          <List>
            <ListRow
              data-testid="rate-row"
              onClick={(event) => {
                rateEditor.open(true, event);
              }}
              title="Default exchange rate"
              subtitle="BDT per USD, for USD records entered without their own rate"
              trailing={
                <span className="flex items-center gap-1">
                  <span className="font-medium tabular-nums">
                    {(settings.rate && rateLabel(settings.rate)) || <span className="text-muted-foreground">Not set</span>}
                  </span>
                  <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
                </span>
              }
            />
          </List>
        ) : settingsQuery.isPending ? (
          <ListSkeleton rows={1} />
        ) : null}
      </Section>
      <LoadError
        error={categoriesQuery.error}
        hasData={Boolean(categoriesQuery.data)}
        onRetry={() => void categoriesQuery.refetch()}
        what="categories"
      />
      {categoriesQuery.data ? (
        <CategorySettings categories={categoriesQuery.data} />
      ) : categoriesQuery.isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : null}
      <Section title="Appearance">
        <List>
          <div className="flex min-h-16 min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-medium">Theme</p>
              <p className="text-label font-normal text-muted-foreground">Saved on this device only</p>
            </div>
            <ThemeChoice />
          </div>
        </List>
      </Section>
      <Section title="Account">
        <List>
          <ListRow title={user.name || user.email} subtitle={<span className="break-all">{user.email}</span>} />
          <ListRow title="Time zone" trailing={<span className="text-muted-foreground">{settings?.timezone ?? "Asia/Dhaka"}</span>} />
          <ListRow
            onClick={signOut}
            title={<span className="text-destructive">Sign out</span>}
            subtitle="Household access is managed in the server's configuration"
            trailing={<LogOut aria-hidden className="size-5 text-destructive" />}
          />
        </List>
      </Section>
      <ChangeLog user={user} />
      <Modal
        open={rateEditor.isOpen}
        onClose={rateEditor.close}
        returnFocus={rateEditor.trigger}
        title="Default exchange rate"
        description="BDT is the default. USD records use this rate unless you enter another rate for that record."
      >
        {settings ? <RateForm settings={settings} onSaved={rateEditor.close} /> : null}
      </Modal>
    </>
  );
}

function RateForm({ settings, onSaved }: { settings: SettingsData; onSaved: () => void }) {
  const writes = useWrites();
  return (
    <SaveForm
      label="Save settings"
      saved={{ message: "Settings saved.", id: settingsSaved }}
      onSaved={onSaved}
      body={(form) => ({
        rate: form.decimal("rate"),
        // Read at submit time from the latest settings.
        version: settings.version,
      })}
      send={(body, key) => writes.updateSettings(body, { key })}
    >
      <RateField
        label="Default exchange rate (BDT per USD)"
        name="rate"
        defaultValue={settings.rate}
        // The confirmation no longer matches the field once it is edited.
        onChange={() => dismissSaved(settingsSaved)}
        placeholder="For example, 125.00"
      />
      <FieldDescription>
        Existing records keep their saved rates. No live exchange-rate service is used.
      </FieldDescription>
    </SaveForm>
  );
}

// Wallet, schedule, bill, target, category, and settings changes as sentences. Loaded on
// demand, newest first.
function ChangeLog({ user }: { user: User }) {
  const [show, setShow] = useState(false);
  const audit = useAudit(show);
  const wallets = useWallets();
  const events = audit.data?.pages.flat() ?? [];
  const context = { meEmail: user.email, wallets: wallets.data ?? [] };
  return (
    <section aria-label="Change log" className="min-w-0">
      <Section title="Change log">
        <p className="text-sm text-muted-foreground">
          Wallet, bill, target, category, and settings changes. Open an Activity record for its
          own edit history.
        </p>
        <LoadError
          error={audit.error}
          hasData={Boolean(audit.data)}
          onRetry={() => void audit.refetch()}
          what="the change log"
        />
        {show && audit.isPending ? <ListSkeleton rows={3} /> : null}
        {audit.data && !events.length ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : null}
        {events.length ? (
          <List data-testid="change-log">
            {events.map((event) => {
              const { sentence, details } = describeAudit(event, context);
              return (
                <div
                  key={event.id}
                  data-testid="change-log-entry"
                  className="flex min-w-0 flex-col gap-1 px-4 py-3"
                >
                  <p className="min-w-0 break-words">{sentence}</p>
                  {details.length ? (
                    <ul className="flex min-w-0 flex-col gap-0.5 text-label font-normal text-muted-foreground">
                      {details.map((detail) => (
                        <li key={detail} className="break-words">
                          {detail}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-caption font-normal text-muted-foreground">
                    <time dateTime={event.created_at}>{dhakaDateTime(event.created_at)}</time>
                  </p>
                </div>
              );
            })}
          </List>
        ) : null}
        {!show || audit.hasNextPage ? (
          <Button
            variant="outline"
            className="self-start"
            disabled={audit.isFetching}
            onClick={() => (show ? void audit.fetchNextPage() : setShow(true))}
          >
            {!show ? <History data-icon="inline-start" /> : null}
            {audit.isFetching ? "Loading…" : show ? "Load older changes" : "View change log"}
          </Button>
        ) : null}
      </Section>
    </section>
  );
}
