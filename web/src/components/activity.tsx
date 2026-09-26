import { useState, type MouseEvent } from "react";
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
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
import { dhakaDate } from "@/lib/dates";
import { moneyLabel } from "@/money/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Choice,
  ErrorMessage,
  MoneyField,
  Notes,
  RateField,
  SaveForm,
  TextField,
  WalletChoice,
} from "@/components/forms";
import {
  LoadError,
  Modal,
  NoRecords,
  PageHeading,
  useEditor,
} from "@/components/layout";
import { CategoryChoice } from "@/components/categories";

const kinds = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer / card repayment" },
];

type Editor = { type: "create" } | { type: "detail"; record: Transaction };

export function Activity() {
  const list = useTransactions();
  const walletsQuery = useWallets();
  const categoriesQuery = useCategories();
  const settingsQuery = useSettings();
  const wallets = walletsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const editor = useEditor<Editor>();
  const ready = Boolean(walletsQuery.data && categoriesQuery.data && settingsQuery.data);
  // Show the latest copy of the open record, falling back to the one that was clicked.
  const detail =
    editor.value?.type === "detail"
      ? (list.records.find((r) => r.id === (editor.value as { record: Transaction }).record.id) ??
        editor.value.record)
      : undefined;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeading>Money records</PageHeading>
        <Button
          size="sm"
          disabled={!ready || !wallets.some((w) => !w.archived)}
          onClick={(e) => editor.open({ type: "create" }, e)}
        >
          <Plus data-icon="inline-start" />
          Add record
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Every entry, with the person who recorded it.
      </p>
      <LoadError
        error={list.isFetchNextPageError ? null : list.error}
        hasData={Boolean(list.data)}
        onRetry={() => void list.refetch()}
        what="records"
      />
      {list.isPending ? <Skeleton className="h-48 w-full" /> : null}
      {list.data && !list.records.length ? (
        <NoRecords
          title="A fresh start"
          description="Add a wallet, then record your first income or expense."
        />
      ) : null}
      {list.records.length ? (
        <div
          data-testid="activity-list"
          className="flex flex-col overflow-hidden rounded-xl border bg-card"
        >
          {list.records.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              wallets={wallets}
              categories={categories}
              onOpen={(e) => editor.open({ type: "detail", record }, e)}
            />
          ))}
        </div>
      ) : null}
      {list.isFetchNextPageError ? (
        <ErrorMessage error="Could not load older records. Please retry." />
      ) : null}
      {list.hasNextPage ? (
        <Button
          variant="outline"
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
        title={editor.value?.type === "detail" ? "Record details" : "Add record"}
        description={
          editor.value?.type === "detail"
            ? "Corrections preserve the previous values and who changed them."
            : "Record what actually moved. Transfers are not income or spending."
        }
      >
        {ready && editor.value?.type === "create" ? (
          <TransactionForm
            wallets={wallets}
            categories={categories}
            settings={settingsQuery.data!}
            onSaved={editor.close}
          />
        ) : null}
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
    </section>
  );
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
  const Icon =
    record.kind === "transfer"
      ? ArrowLeftRight
      : record.kind === "income"
        ? ArrowDownLeft
        : ArrowUpRight;
  return (
    <button
      data-testid="activity-row"
      className="flex min-h-24 w-full items-start gap-3 border-b p-4 text-left last:border-0 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      onClick={onOpen}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap justify-between gap-1">
          <span className="break-words font-medium">
            {record.note ||
              `${record.kind[0].toUpperCase()}${record.kind.slice(1)}`}
          </span>
          <span className="font-semibold whitespace-nowrap tabular-nums">
            {moneyLabel(record.amount, wallet?.currency ?? "BDT")}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {wallet?.name} · {record.date}
        </span>
        <span className="break-all text-xs text-muted-foreground">
          {record.actor_email}
        </span>
        {record.category_id && (
          <span className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
            {categories.find((c) => c.id === record.category_id)?.name}
          </span>
        )}
        {record.voided ? <Badge variant="outline">Voided</Badge> : null}
      </div>
    </button>
  );
}

function TransactionForm({
  wallets,
  categories,
  settings,
  initial: initialProp,
  onSaved,
}: {
  wallets: Wallet[];
  categories: Category[];
  settings: Settings;
  initial?: Transaction;
  onSaved: () => void;
}) {
  const writes = useWrites();
  // Snapshot at open: the correction is checked against the version the user started from.
  const [initial] = useState(initialProp);
  const active = wallets.filter((w) => !w.archived);
  const [kind, setKind] = useState<Transaction["kind"]>(initial?.kind ?? "expense");
  const [categoryEditing, setCategoryEditing] = useState(false);
  const [walletID, setWalletID] = useState(
    initial?.wallet_id ?? active[0]?.id ?? "",
  );
  const [toID, setToID] = useState(initial?.to_wallet_id ?? "");
  const targets = active.filter((w) => w.id !== walletID);
  const destination = toID || (targets[0]?.id ?? "");
  const wallet = active.find((w) => w.id === walletID);
  const target = targets.find((w) => w.id === destination);
  const foreign =
    wallet?.currency === "USD" ||
    (kind === "transfer" && target?.currency === "USD");
  const crossCurrency =
    kind === "transfer" && wallet?.currency !== target?.currency;
  const recordKind = kind as "income" | "expense" | "transfer";
  return (
    <SaveForm
      label={initial ? "Save correction" : "Save record"}
      onSaved={onSaved}
      disabled={categoryEditing || !wallet || (kind === "transfer" && !target)}
      body={(form) => ({
        kind: recordKind,
        category_id: kind === "transfer" ? "" : form.text("category_id"),
        wallet_id: walletID,
        to_wallet_id: kind === "transfer" ? destination : "",
        amount: form.decimal("amount"),
        received_amount: crossCurrency ? form.decimal("received_amount") : "",
        date: form.text("date"),
        rate: foreign ? form.decimal("rate") : "",
        note: form.text("note"),
        reason: form.text("reason"),
      })}
      send={(body, key) =>
        initial
          ? writes.correctTransaction(initial.id, { ...body, version: initial.version }, { key })
          : writes.createTransaction(body, { key })
      }
    >
      {!initial ? (
        <Choice
          label="Transaction type"
          name="kind"
          value={kind}
          onChange={(value) => {
            setKind(value as Transaction["kind"]);
            setCategoryEditing(false);
          }}
          options={kinds}
        />
      ) : (
        <Badge variant="secondary">Correcting {kind}</Badge>
      )}
      <WalletChoice
        wallets={wallets}
        label={kind === "transfer" ? "From wallet" : "Wallet"}
        value={walletID}
        onChange={setWalletID}
      />
      {(!wallet || (kind === "transfer" && !target)) && (
        <ErrorMessage error="Choose active wallets before saving. Reactivate an archived wallet in Wallets, or explicitly select a replacement. A transfer needs two different wallets." />
      )}
      {(kind === "expense" || kind === "income") && (
        <CategoryChoice
          key={kind}
          type={kind}
          categories={categories}
          initial={initial?.category_id}
          onEditingChange={setCategoryEditing}
        />
      )}
      {kind === "transfer" ? (
        <WalletChoice
          wallets={wallets}
          disabledID={walletID}
          label="To wallet"
          name="to_wallet_id"
          value={destination}
          onChange={setToID}
        />
      ) : null}
      <MoneyField
        label="Amount"
        name="amount"
        defaultValue={initial?.amount}
        placeholder="0.00"
      />
      <p className="text-sm text-muted-foreground">
        Amount in {wallet?.currency ?? "your wallet currency"}.
        {wallet?.card_type === "credit" && kind === "expense"
          ? " This increases the card debt."
          : ""}
      </p>
      {crossCurrency ? (
        <MoneyField
          label={`Amount received (${target?.currency})`}
          name="received_amount"
          defaultValue={initial?.received_amount}
          required={false}
          placeholder="Use exchange rate"
        />
      ) : null}
      {foreign ? (
        <RateField
          label="Exchange rate (BDT per USD)"
          name="rate"
          defaultValue={initial?.rate}
          placeholder={settings.rate || "Set a rate"}
          required={!settings.rate && !initial?.rate}
          hint="An empty field uses the default rate. Saved records keep their own rate."
        />
      ) : null}
      <TextField
        label="Date"
        name="date"
        type="date"
        defaultValue={initial?.date ?? dhakaDate()}
        required
      />
      <Notes defaultValue={initial?.note} />
      {kind === "transfer" ? (
        <p className="text-sm text-muted-foreground">
          For a card repayment, transfer from your bank or cash wallet to the
          credit card. Record a transfer fee as a separate expense.
        </p>
      ) : null}
      {initial ? (
        <Notes label="Reason for correction" name="reason" />
      ) : null}
    </SaveForm>
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
        onSaved={onSaved}
        body={(form) => ({ version: voidVersion, reason: form.text("reason") })}
        send={(body, key) => writes.voidTransaction(record.id, body, { key })}
      >
        <p className="text-sm">
          This reverses the balance changes. The original record stays in
          history. A recurring bill payment becomes due again.
        </p>
        <Notes label="Reason" name="reason" required />
      </SaveForm>
    );
  const wallet = wallets.find((w) => w.id === record.wallet_id);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xl font-semibold whitespace-nowrap tabular-nums">
        {moneyLabel(record.amount, wallet?.currency ?? "BDT")}
      </p>
      <p className="break-words">{record.note || record.kind}</p>
      {record.category_id && (
        <p className="whitespace-pre-wrap break-words">
          Category: {categories.find((c) => c.id === record.category_id)?.name}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {wallet?.name} · {record.date}
      </p>
      {record.to_wallet_id ? (
        <p className="text-sm">
          To {wallets.find((w) => w.id === record.to_wallet_id)?.name} ·{" "}
          {record.received_amount}
        </p>
      ) : null}
      {record.rate ? (
        <p className="text-sm text-muted-foreground">
          Rate: {record.rate} BDT per USD · BDT value: {record.bdt_amount}
        </p>
      ) : null}
      {!record.voided && !["opening", "adjustment"].includes(record.kind) ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => setMode("edit")}
          >
            Correct record
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="destructive"
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
      <h3 className="font-semibold">Edit history</h3>
      <LoadError
        error={history.error}
        hasData={Boolean(history.data)}
        onRetry={() => void history.refetch()}
        what="the history"
      />
      {history.data ? (
        history.data.map((revision) => (
          <div
            key={revision.version}
            className="flex flex-col gap-1 rounded-lg border p-3 text-sm"
          >
            <p className="font-medium">
              Version {revision.version} ·{" "}
              {moneyLabel(revision.amount, wallet?.currency ?? "BDT")}
              {revision.voided ? " · Voided" : ""}
            </p>
            <p className="break-all text-muted-foreground">
              {revision.actor_email}
            </p>
            <p className="text-muted-foreground">
              {new Date(revision.created_at).toLocaleString("en-US", {
                timeZone: "Asia/Dhaka",
              })}
            </p>
            <p className="break-words">{revision.note}</p>
            {revision.category_id && (
              <p className="whitespace-pre-wrap break-words">
                Category:{" "}
                {categories.find((c) => c.id === revision.category_id)?.name}
              </p>
            )}
            {revision.reason ? <p>Reason: {revision.reason}</p> : null}
            {revision.rate ? <p>Rate: {revision.rate}</p> : null}
          </div>
        ))
      ) : history.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : null}
    </div>
  );
}
