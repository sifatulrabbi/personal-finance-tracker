import { useState, type MouseEvent } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ReceiptText,
  Scale,
} from "lucide-react";
import type { Category, Settings, Transaction, Wallet } from "@/api/types";
import {
  useCategories,
  useHistory,
  useSettings,
  useTransactions,
  useWallets,
} from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { directionForKind, moneyLabel } from "@/money/format";
import { shortDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorMessage, Notes, SaveForm } from "@/components/forms";
import {
  EmptyState,
  List,
  ListRow,
  ListSkeleton,
  LoadError,
  Modal,
  PageIntro,
  RowIcon,
  useEditor,
} from "@/components/layout";
import { Money } from "@/components/money";
import { TransactionForm } from "@/components/transaction-form";
import { useAddRecord } from "@/components/add-record";

type Editor = { type: "detail"; record: Transaction };

const kindLabels: Record<Transaction["kind"], string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  opening: "Opening balance",
  adjustment: "Balance adjustment",
};

export function Activity() {
  const list = useTransactions();
  const walletsQuery = useWallets();
  const categoriesQuery = useCategories();
  const settingsQuery = useSettings();
  const addRecord = useAddRecord();
  const wallets = walletsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const editor = useEditor<Editor>();
  const ready = Boolean(walletsQuery.data && categoriesQuery.data && settingsQuery.data);
  // Show the latest copy of the open record, falling back to the one that was clicked.
  const detail = editor.value
    ? (list.records.find((r) => r.id === editor.value!.record.id) ?? editor.value.record)
    : undefined;
  return (
    <>
      <PageIntro description="Every entry, with the person who recorded it." />
      <LoadError
        error={list.isFetchNextPageError ? null : list.error}
        hasData={Boolean(list.data)}
        onRetry={() => void list.refetch()}
        what="records"
      />
      {list.isPending ? <ListSkeleton rows={6} /> : null}
      {list.data && !list.records.length ? (
        <EmptyState
          icon={<ReceiptText />}
          title="A fresh start"
          description="Add a wallet, then record your first income or expense."
          action={
            <Button variant="outline" onClick={(event) => addRecord.open(event)}>
              Add your first record
            </Button>
          }
        />
      ) : null}
      {list.records.length ? (
        <List data-testid="activity-list">
          {list.records.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              wallets={wallets}
              categories={categories}
              onOpen={(e) => editor.open({ type: "detail", record }, e)}
            />
          ))}
        </List>
      ) : null}
      {list.isFetchNextPageError ? (
        <ErrorMessage error="Could not load older records. Please retry." />
      ) : null}
      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? "Loading…" : "Load older records"}
        </Button>
      ) : null}
      <Modal
        open={editor.isOpen}
        onClose={editor.close}
        returnFocus={editor.trigger}
        title="Record details"
        description="Corrections preserve the previous values and who changed them."
      >
        {ready && detail ? (
          <RecordDetail
            key={detail.id}
            record={detail}
            wallets={wallets}
            categories={categories}
            settings={settingsQuery.data!}
            onSaved={editor.close}
          />
        ) : null}
      </Modal>
    </>
  );
}

function KindIcon({ kind }: { kind: Transaction["kind"] }) {
  if (kind === "income")
    return (
      <RowIcon tone="income">
        <ArrowDownLeft />
      </RowIcon>
    );
  if (kind === "transfer")
    return (
      <RowIcon tone="transfer">
        <ArrowLeftRight />
      </RowIcon>
    );
  if (kind === "expense")
    return (
      <RowIcon>
        <ArrowUpRight />
      </RowIcon>
    );
  return (
    <RowIcon>
      <Scale />
    </RowIcon>
  );
}

// The part of an email before the @: enough to tell two household members apart.
function shortAuthor(email: string) {
  return email.split("@")[0] || email;
}

function RecordRow({
  record,
  wallets,
  categories,
  onOpen,
}: {
  record: Transaction;
  wallets: Wallet[];
  categories: Category[];
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const wallet = wallets.find((w) => w.id === record.wallet_id);
  const to = record.to_wallet_id ? wallets.find((w) => w.id === record.to_wallet_id) : undefined;
  const category = record.category_id
    ? categories.find((c) => c.id === record.category_id)?.name
    : undefined;
  const subtitle = [
    to ? `${wallet?.name ?? "Wallet"} → ${to.name}` : wallet?.name,
    category,
    shortAuthor(record.actor_email),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListRow
      data-testid="activity-row"
      onClick={onOpen}
      leading={<KindIcon kind={record.kind} />}
      title={
        <span className={record.voided ? "text-muted-foreground" : undefined}>
          {record.note || kindLabels[record.kind]}
        </span>
      }
      // One line: the full text stays available as a tooltip and in the record's details.
      subtitle={
        <span className="block truncate" title={`${subtitle} · ${record.actor_email}`}>
          {subtitle}
        </span>
      }
      trailing={
        <Money
          className="font-semibold"
          amount={record.amount}
          currency={wallet?.currency ?? "BDT"}
          direction={directionForKind(record.kind)}
          voided={record.voided}
        />
      }
      meta={
        <span className="flex items-center gap-1.5 text-caption font-normal text-muted-foreground">
          {record.voided ? <Badge variant="outline">Voided</Badge> : null}
          <time dateTime={record.date}>{shortDate(record.date)}</time>
        </span>
      }
    />
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function RecordDetail({
  record,
  wallets,
  categories,
  settings,
  onSaved,
}: {
  record: Transaction;
  wallets: Wallet[];
  categories: Category[];
  settings: Settings;
  onSaved: () => void;
}) {
  const writes = useWrites();
  const [mode, setMode] = useState<"view" | "edit" | "void">("view");
  const history = useHistory(record.id);
  // The version the user saw when choosing to void.
  const [voidVersion, setVoidVersion] = useState(record.version);
  if (mode === "edit")
    return (
      <TransactionForm
        wallets={wallets}
        categories={categories}
        settings={settings}
        initial={record}
        onSaved={onSaved}
      />
    );
  if (mode === "void")
    return (
      <SaveForm
        label="Confirm void"
        saved="Record voided"
        onSaved={onSaved}
        body={(form) => ({ version: voidVersion, reason: form.text("reason") })}
        send={(body, key) => writes.voidTransaction(record.id, body, { key })}
      >
        <p className="text-sm">
          This reverses the balance changes. The original record stays in history. A
          recurring bill payment becomes due again.
        </p>
        <Notes label="Reason" name="reason" required />
      </SaveForm>
    );
  const wallet = wallets.find((w) => w.id === record.wallet_id);
  const destination = record.to_wallet_id
    ? wallets.find((w) => w.id === record.to_wallet_id)
    : undefined;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-display">
          <Money
            amount={record.amount}
            currency={wallet?.currency ?? "BDT"}
            direction={directionForKind(record.kind)}
            voided={record.voided}
          />
        </p>
        <p className="break-words text-heading">{record.note || kindLabels[record.kind]}</p>
        {record.voided ? <Badge variant="outline">Voided</Badge> : null}
      </div>
      <div className="flex flex-col">
        {record.category_id && (
          <p className="whitespace-pre-wrap break-words text-sm">
            Category: {categories.find((c) => c.id === record.category_id)?.name}
          </p>
        )}
        <dl className="flex flex-col divide-y">
          <Detail label={destination ? "From" : "Wallet"}>{wallet?.name}</Detail>
          {destination ? (
            <Detail label="To">
              {destination.name}
              {record.received_amount ? (
                <>
                  {" · "}
                  <Money amount={record.received_amount} currency={destination.currency} />
                </>
              ) : null}
            </Detail>
          ) : null}
          <Detail label="Date">{record.date}</Detail>
          <Detail label="Recorded by">{record.actor_email}</Detail>
          {record.rate ? (
            <Detail label="Rate">
              {record.rate} BDT per USD · BDT value{" "}
              <Money amount={record.bdt_amount} currency="BDT" />
            </Detail>
          ) : null}
        </dl>
      </div>
      {!record.voided && !["opening", "adjustment"].includes(record.kind) ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => setMode("edit")}>
            Correct record
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="destructive-outline"
            onClick={() => {
              setVoidVersion(record.version);
              setMode("void");
            }}
          >
            Void record
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {record.voided
            ? "This record was voided."
            : "To correct a reconciliation record, make a new wallet adjustment."}
        </p>
      )}
      <h3 className="text-heading">Edit history</h3>
      <LoadError
        error={history.error}
        hasData={Boolean(history.data)}
        onRetry={() => void history.refetch()}
        what="the history"
      />
      {history.data ? (
        <ol className="flex flex-col gap-2">
          {history.data.map((revision) => (
            <li
              key={revision.version}
              className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-sm"
            >
              <p className="font-medium tabular-nums">
                Version {revision.version} ·{" "}
                {moneyLabel(revision.amount, wallet?.currency ?? "BDT")}
                {revision.voided ? " · Voided" : ""}
              </p>
              <p className="break-all text-muted-foreground">{revision.actor_email}</p>
              <p className="text-muted-foreground">
                {new Date(revision.created_at).toLocaleString("en-US", {
                  timeZone: "Asia/Dhaka",
                })}
              </p>
              {revision.note ? <p className="break-words">{revision.note}</p> : null}
              {revision.category_id && (
                <p className="whitespace-pre-wrap break-words">
                  Category: {categories.find((c) => c.id === revision.category_id)?.name}
                </p>
              )}
              {revision.reason ? <p>Reason: {revision.reason}</p> : null}
              {revision.rate ? <p>Rate: {revision.rate}</p> : null}
            </li>
          ))}
        </ol>
      ) : history.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : null}
    </div>
  );
}
