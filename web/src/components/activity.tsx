import { useEffect, useState } from "react";
import {
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
} from "lucide-react";
import {
  api,
  dhakaDate,
  moneyLabel,
  type Data,
  type Transaction,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Choice,
  ErrorMessage,
  MoneyField,
  Notes,
  SaveForm,
  TextField,
  WalletChoice,
  value,
} from "@/components/forms";
import { Modal, NoRecords } from "@/components/layout";
import { CategoryChoice } from "@/components/categories";

const kinds = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer / card repayment" },
];
export function Activity({
  data,
  onSaved,
}: {
  data: Data;
  onSaved: () => void;
}) {
  const [editor, setEditor] = useState<"create" | Transaction | null>(null);
  const [older, setOlder] = useState<Transaction[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setOlder([]);
    setMore(data.transactions.length === 50);
  }, [data.transactions]);
  const saved = () => {
    setEditor(null);
    onSaved();
  };
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Money records</h2>
        <Button
          size="sm"
          disabled={!data.wallets.some((w) => !w.archived)}
          onClick={() => setEditor("create")}
        >
          <Plus data-icon="inline-start" />
          Add record
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Every entry, with the person who recorded it.
      </p>
      {!data.transactions.length ? (
        <NoRecords
          title="A fresh start"
          description="Add a wallet, then record your first income or expense."
        />
      ) : null}
      <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
        {[...data.transactions, ...older].map((record) => {
          const wallet = data.wallets.find((w) => w.id === record.wallet_id);
          const Icon =
            record.kind === "transfer"
              ? ArrowLeftRight
              : record.kind === "income"
                ? ArrowDownLeft
                : ArrowUpRight;
          return (
            <button
              key={record.id}
              className="flex min-h-24 w-full items-start gap-3 border-b p-4 text-left last:border-0 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => setEditor(record)}
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
                  <span className="font-semibold tabular-nums">
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
                    {
                      data.categories.find((c) => c.id === record.category_id)
                        ?.name
                    }
                  </span>
                )}
                {record.voided ? <Badge variant="outline">Voided</Badge> : null}
              </div>
            </button>
          );
        })}
      </div>
      <ErrorMessage error={error} />
      {more ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const next = await api<Transaction[]>(
                `/transactions?limit=50&offset=${data.transactions.length + older.length}`,
              );
              setOlder((previous) => [...previous, ...next]);
              setMore(next.length === 50);
            } catch {
              setError("Could not load older records. Please retry.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Loading…" : "Load older records"}
        </Button>
      ) : null}
      {editor === "create" ? (
        <Modal
          title="Add record"
          description="Record what actually moved. Transfers are not income or spending."
          onClose={() => setEditor(null)}
        >
          <TransactionForm
            data={data}
            onSaved={saved}
            onCategoriesChanged={onSaved}
          />
        </Modal>
      ) : null}
      {editor && editor !== "create" ? (
        <Modal
          title="Record details"
          description="Corrections preserve the previous values and who changed them."
          onClose={() => setEditor(null)}
        >
          <RecordDetail
            data={data}
            record={editor}
            onSaved={saved}
            onCategoriesChanged={onSaved}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function TransactionForm({
  data,
  initial,
  onSaved,
  onCategoriesChanged,
}: {
  data: Data;
  initial?: Transaction;
  onSaved: () => void;
  onCategoriesChanged: () => void;
}) {
  const active = data.wallets.filter((w) => !w.archived);
  const [kind, setKind] = useState(initial?.kind ?? "expense");
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
  return (
    <SaveForm
      path={initial ? `/transactions/${initial.id}` : "/transactions"}
      method={initial ? "PUT" : "POST"}
      label={initial ? "Save correction" : "Save record"}
      onSaved={onSaved}
      disabled={categoryEditing || !wallet || (kind === "transfer" && !target)}
      body={(form) => ({
        kind,
        category_id: kind === "transfer" ? "" : value(form, "category_id"),
        wallet_id: walletID,
        to_wallet_id: kind === "transfer" ? destination : "",
        amount: value(form, "amount"),
        received_amount: crossCurrency ? value(form, "received_amount") : "",
        date: value(form, "date"),
        rate: value(form, "rate"),
        note: value(form, "note"),
        reason: value(form, "reason"),
        ...(initial ? { version: initial.version } : {}),
      })}
    >
      {!initial ? (
        <Choice
          label="Transaction type"
          name="kind"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setCategoryEditing(false);
          }}
          options={kinds}
        />
      ) : (
        <Badge variant="secondary">Correcting {kind}</Badge>
      )}
      <WalletChoice
        wallets={data.wallets}
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
          categories={data.categories}
          initial={initial?.category_id}
          onEditingChange={setCategoryEditing}
          onCreated={onCategoriesChanged}
        />
      )}
      {kind === "transfer" ? (
        <WalletChoice
          wallets={data.wallets}
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
        <TextField
          label="Exchange rate (BDT per USD)"
          name="rate"
          type="number"
          step="0.000001"
          min="0.000001"
          inputMode="decimal"
          defaultValue={initial?.rate}
          placeholder={data.settings.rate || "Set a rate"}
          required={!data.settings.rate && !initial?.rate}
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
        <Notes label="Reason for correction" name="reason" required />
      ) : null}
    </SaveForm>
  );
}

function RecordDetail({
  data,
  record,
  onSaved,
  onCategoriesChanged,
}: {
  data: Data;
  record: Transaction;
  onSaved: () => void;
  onCategoriesChanged: () => void;
}) {
  const [mode, setMode] = useState("view");
  const [history, setHistory] = useState<Transaction[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Transaction[]>(`/transactions/${record.id}/history`)
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch(() => {
        if (active)
          setError("Could not load history. Close and reopen to retry.");
      });
    return () => {
      active = false;
    };
  }, [record.id]);
  if (mode === "edit")
    return (
      <TransactionForm
        data={data}
        initial={record}
        onSaved={onSaved}
        onCategoriesChanged={onCategoriesChanged}
      />
    );
  if (mode === "void")
    return (
      <SaveForm
        path={`/transactions/${record.id}/void`}
        label="Confirm void"
        onSaved={onSaved}
        body={(form) => ({
          version: record.version,
          reason: value(form, "reason"),
        })}
      >
        <p className="text-sm">
          This reverses the balance changes. The original record stays in
          history. A recurring bill payment becomes due again.
        </p>
        <Notes label="Reason" name="reason" required />
      </SaveForm>
    );
  const wallet = data.wallets.find((w) => w.id === record.wallet_id);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xl font-semibold">
        {moneyLabel(record.amount, wallet?.currency ?? "BDT")}
      </p>
      <p className="break-words">{record.note || record.kind}</p>
      {record.category_id && (
        <p className="whitespace-pre-wrap break-words">
          Category:{" "}
          {data.categories.find((c) => c.id === record.category_id)?.name}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {wallet?.name} · {record.date}
      </p>
      {record.to_wallet_id ? (
        <p className="text-sm">
          To {data.wallets.find((w) => w.id === record.to_wallet_id)?.name} ·{" "}
          {record.received_amount}
        </p>
      ) : null}
      {record.rate ? (
        <p className="text-sm text-muted-foreground">
          Rate: {record.rate} BDT per USD · BDT value: {record.bdt_amount}
        </p>
      ) : null}
      {!record.voided && !["opening", "adjustment"].includes(record.kind) ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode("edit")}>
            Correct record
          </Button>
          <Button variant="destructive" onClick={() => setMode("void")}>
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
      <ErrorMessage error={error} />
      {history ? (
        history.map((revision) => (
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
                {
                  data.categories.find((c) => c.id === revision.category_id)
                    ?.name
                }
              </p>
            )}
            {revision.reason ? <p>Reason: {revision.reason}</p> : null}
            {revision.rate ? <p>Rate: {revision.rate}</p> : null}
          </div>
        ))
      ) : (
        <Skeleton className="h-20 w-full" />
      )}
    </div>
  );
}
