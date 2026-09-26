import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "cn";
import { errorMessage, isApiError } from "@/api/errors";
import { mutationKey, type MutationKey } from "@/api/idempotency";
import type { Category, Settings, Transaction, Wallet } from "@/api/types";
import { useHistory } from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { authorName, dhakaDateTime, longDate, revisionCurrencies } from "@/activity/people";
import { directionForKind, rateLabel } from "@/money/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ErrorMessage } from "@/components/forms";
import { notifySaved } from "@/components/feedback";
import { LoadError, useInSheet } from "@/components/layout";
import { Money } from "@/components/money";
import { RecordForm } from "@/components/record-form";

export const kindLabels: Record<Transaction["kind"], string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  opening: "Opening balance",
  adjustment: "Balance adjustment",
};

// Reconciliation records are corrected with a new adjustment, never rewritten (ADR 0002).
export function isCorrectable(record: Transaction) {
  return !record.voided && record.kind !== "opening" && record.kind !== "adjustment";
}

// A record's title in lists and details: its note, else its category, else its kind.
export function recordTitle(record: Pick<Transaction, "note" | "kind" | "category_id">, categories: Category[]) {
  if (record.note.trim()) return record.note;
  const category = record.category_id ? categories.find((c) => c.id === record.category_id) : undefined;
  return category?.name ?? kindLabels[record.kind];
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

// The record detail sheet: every field, the actions it allows, and its full history.
export function RecordDetail({
  record,
  wallets,
  categories,
  settings,
  me,
  onDone,
}: {
  record: Transaction;
  wallets: Wallet[];
  categories: Category[];
  settings: Settings;
  me?: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "void">("view");
  if (mode === "edit")
    return (
      <RecordForm
        wallets={wallets}
        categories={categories}
        settings={settings}
        record={record}
        onSaved={onDone}
      />
    );
  if (mode === "void")
    return <VoidForm record={record} onDone={onDone} onReloaded={() => setMode("view")} />;
  const { currency, toCurrency } = revisionCurrencies(record, wallets);
  const wallet = wallets.find((w) => w.id === record.wallet_id);
  const destination = record.to_wallet_id ? wallets.find((w) => w.id === record.to_wallet_id) : undefined;
  const category = record.category_id ? categories.find((c) => c.id === record.category_id) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{kindLabels[record.kind]}</Badge>
          {record.voided ? <Badge variant="outline">Voided</Badge> : null}
        </div>
        <p className="text-display">
          <Money
            data-testid="record-amount"
            amount={record.amount}
            currency={currency}
            direction={directionForKind(record.kind)}
            voided={record.voided}
          />
        </p>
        <p className="text-heading break-words">{recordTitle(record, categories)}</p>
      </div>
      <dl className="flex min-w-0 flex-col divide-y border-y">
        <Detail label={destination ? "From" : "Wallet"}>{wallet?.name ?? "Unknown wallet"}</Detail>
        {record.to_wallet_id ? (
          <Detail label="To">{destination?.name ?? "Unknown wallet"}</Detail>
        ) : null}
        {record.received_amount ? (
          <Detail label="Received">
            <Money amount={record.received_amount} currency={toCurrency ?? "BDT"} />
          </Detail>
        ) : null}
        {category ? <Detail label="Category">{category.name}</Detail> : null}
        <Detail label="Date">{longDate(record.date)}</Detail>
        {record.rate && (currency === "USD" || toCurrency === "USD") ? (
          <Detail label="Rate">
            {rateLabel(record.rate)} BDT per USD
            {record.bdt_amount ? (
              <>
                {" · "}
                <Money amount={record.bdt_amount} currency="BDT" />
              </>
            ) : null}
          </Detail>
        ) : null}
        <Detail label="Last change">
          {authorName(record.actor_email, me)} · {dhakaDateTime(record.created_at)}
        </Detail>
      </dl>
      {isCorrectable(record) ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => setMode("edit")}>
            Correct record
          </Button>
          <Button className="w-full sm:w-auto" variant="destructive-outline" onClick={() => setMode("void")}>
            Void record
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {record.voided
            ? "This record was voided. Its balance change was reversed; the history below keeps every version."
            : "Opening balances and adjustments cannot be corrected or voided. To fix a balance, make a new adjustment from the wallet."}
        </p>
      )}
      <RecordHistory record={record} wallets={wallets} categories={categories} me={me} />
    </div>
  );
}

// Every preserved version, newest first. Each version shows its amounts in the currency of
// the wallets it named at the time, not the record's current wallet.
function RecordHistory({
  record,
  wallets,
  categories,
  me,
}: {
  record: Transaction;
  wallets: Wallet[];
  categories: Category[];
  me?: string;
}) {
  const history = useHistory(record.id);
  const revisions = history.data ? [...history.data].sort((a, b) => b.version - a.version) : [];
  const name = (id?: string) => (id ? (wallets.find((w) => w.id === id)?.name ?? "Unknown wallet") : "");
  return (
    <section aria-label="Edit history" className="flex min-w-0 flex-col gap-3">
      <h3 className="text-heading">Edit history</h3>
      <LoadError
        error={history.error}
        hasData={Boolean(history.data)}
        onRetry={() => void history.refetch()}
        what="the history"
      />
      {history.data ? (
        <ol className="flex min-w-0 flex-col">
          {revisions.map((revision, index) => {
            const { currency, toCurrency } = revisionCurrencies(revision, wallets);
            const previous = revisions[index + 1];
            const action = revision.voided && !previous?.voided
              ? "Voided"
              : previous
                ? "Corrected"
                : "Recorded";
            const category = revision.category_id
              ? categories.find((c) => c.id === revision.category_id)?.name
              : undefined;
            const where = revision.to_wallet_id
              ? `${name(revision.wallet_id)} → ${name(revision.to_wallet_id)}`
              : name(revision.wallet_id);
            return (
              <li
                key={revision.version}
                data-testid="history-entry"
                className="relative flex min-w-0 gap-3 pb-4 last:pb-0"
              >
                {/* The timeline rail and its dot. */}
                <div aria-hidden className="flex w-3 shrink-0 flex-col items-center pt-1.5">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      index === 0 ? "bg-primary" : "bg-border",
                    )}
                  />
                  {index < revisions.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <p className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">
                      Version {revision.version} · {action}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {authorName(revision.actor_email, me)} · {dhakaDateTime(revision.created_at)}
                    </span>
                  </p>
                  <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <Money
                      data-testid="history-amount"
                      className="font-semibold"
                      amount={revision.amount}
                      currency={currency}
                      direction={directionForKind(revision.kind)}
                      voided={revision.voided}
                    />
                    {revision.received_amount ? (
                      <span className="text-muted-foreground">
                        received <Money amount={revision.received_amount} currency={toCurrency ?? "BDT"} />
                      </span>
                    ) : null}
                  </p>
                  <p className="min-w-0 break-words text-muted-foreground">
                    {[where, category, longDate(revision.date)].filter(Boolean).join(" · ")}
                  </p>
                  {revision.note ? <p className="min-w-0 break-words">{revision.note}</p> : null}
                  {revision.rate && (currency === "USD" || toCurrency === "USD") ? (
                    <p className="text-muted-foreground">Rate {rateLabel(revision.rate)} BDT per USD</p>
                  ) : null}
                  {revision.reason ? (
                    <p className="min-w-0 break-words">
                      <span className="text-muted-foreground">Reason: </span>
                      {revision.reason}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : history.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : null}
    </section>
  );
}

// Voiding reverses the balance change and keeps the record in history. It needs a reason
// and is checked against the version the user saw.
function VoidForm({
  record,
  onDone,
  onReloaded,
}: {
  record: Transaction;
  onDone: () => void;
  onReloaded: () => void;
}) {
  const writes = useWrites();
  const inSheet = useInSheet();
  const [version] = useState(record.version);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const last = useRef<MutationKey | undefined>(undefined);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!reason.trim()) {
      setError("Write why this record is being voided.");
      return;
    }
    const body = { version, reason };
    last.current = mutationKey(last.current, `void:${record.id}`, body);
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await writes.voidTransaction(record.id, body, { key: last.current.key });
      last.current = undefined;
      notifySaved("Record voided");
      onDone();
    } catch (problem) {
      if (isApiError(problem) && problem.code === "stale_version") setStale(true);
      setError(errorMessage(problem, "Could not void the record. Try again."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    try {
      await writes.refreshTransaction(record.id);
      onReloaded();
    } catch (problem) {
      setError(errorMessage(problem, "Could not load the latest version. Try again."));
    }
  }
  return (
    <form onSubmit={submit} noValidate data-sheet-form="" className="flex min-w-0 flex-col">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-sm">
          Voiding reverses this record's balance change. The record stays in the history,
          struck through. A recurring bill payment becomes due again.
        </p>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`void-reason-${record.id}`} className="text-label">
            Reason
          </label>
          <Textarea
            id={`void-reason-${record.id}`}
            value={reason}
            maxLength={500}
            required
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
      <div
        data-slot="sheet-footer"
        className={cn(
          "mt-5 flex flex-col gap-3",
          inSheet && "sticky bottom-0 z-10 -mx-4 border-t bg-card px-4 py-3 sm:-mx-5 sm:px-5",
        )}
      >
        <ErrorMessage error={stale ? "Someone changed this record since you opened it. Review the latest version before voiding." : error} />
        {stale ? (
          <Button type="button" variant="outline" onClick={() => void reload()}>
            Show the latest version
          </Button>
        ) : null}
        <Button type="submit" size="lg" variant="destructive" className="w-full" disabled={busy || stale}>
          {busy ? "Voiding…" : "Confirm void"}
        </Button>
      </div>
    </form>
  );
}
