import { useState } from "react";
import { Plus, Pencil, SlidersHorizontal } from "lucide-react";
import type { CardType, Currency, Wallet, WalletType } from "@/api/types";
import { useWallets } from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { moneyLabel } from "@/money/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Choice,
  MoneyField,
  SaveForm,
  TextField,
  Notes,
} from "@/components/forms";
import {
  LoadError,
  Modal,
  NoRecords,
  PageHeading,
  useEditor,
} from "@/components/layout";

const types: { value: WalletType; label: string }[] = [
  { value: "physical", label: "Physical cash" },
  { value: "bank", label: "Bank account" },
  { value: "digital", label: "Digital wallet" },
  { value: "card", label: "Card" },
];

type Editor = { mode: "create" } | { mode: "edit" | "adjust"; id: string };

export function Wallets() {
  const query = useWallets();
  const wallets = query.data ?? [];
  const editor = useEditor<Editor>();
  const [showArchived, setShowArchived] = useState(false);
  // Read the wallet being edited from the cache so it is never a stale snapshot.
  const current =
    editor.value && editor.value.mode !== "create"
      ? wallets.find((w) => w.id === (editor.value as { id: string }).id)
      : undefined;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeading>Your wallets</PageHeading>
        <Button size="sm" onClick={(e) => editor.open({ mode: "create" }, e)}>
          <Plus data-icon="inline-start" />
          Add wallet
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Cash you hold and credit you owe, kept separate.
      </p>
      <LoadError
        error={query.error}
        hasData={Boolean(query.data)}
        onRetry={() => void query.refetch()}
        what="wallets"
      />
      {query.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {query.data && !wallets.length ? (
        <NoRecords
          title="Start with a wallet"
          description="Add your cash, bank account, bKash, or card with its current balance."
        />
      ) : null}
      {wallets
        .filter((wallet) => showArchived || !wallet.archived)
        .map((wallet) => (
          <Card key={wallet.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="min-w-0 break-all">
                  {wallet.name}
                </CardTitle>
                <Badge variant="secondary">{wallet.currency}</Badge>
              </div>
              <CardDescription>
                {wallet.card_type === "credit"
                  ? "Credit card · debt owed"
                  : types.find((type) => type.value === wallet.type)?.label}
                {wallet.archived ? " · Archived" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="@container flex flex-col gap-2">
              {/* Never break inside a number: the size shrinks with the card instead. */}
              <p
                data-testid="wallet-balance"
                className="text-[min(1.875rem,9cqi)] font-semibold tracking-tight whitespace-nowrap tabular-nums"
              >
                {moneyLabel(wallet.debt ?? wallet.balance, wallet.currency)}
              </p>
              {wallet.card_type === "credit" ? (
                <p className="text-sm text-muted-foreground">
                  Available{" "}
                  {moneyLabel(wallet.available_credit ?? "0.00", wallet.currency)} ·
                  Limit {moneyLabel(wallet.credit_limit, wallet.currency)}
                </p>
              ) : null}
              {wallet.details ? (
                <p className="break-words whitespace-pre-wrap text-sm text-muted-foreground">
                  {wallet.details}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => editor.open({ mode: "edit", id: wallet.id }, e)}
              >
                <Pencil data-icon="inline-start" />
                Edit wallet
              </Button>
              {!wallet.archived ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => editor.open({ mode: "adjust", id: wallet.id }, e)}
                >
                  <SlidersHorizontal data-icon="inline-start" />
                  Adjust {wallet.card_type === "credit" ? "debt" : "balance"}
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        ))}
      {wallets.some((wallet) => wallet.archived) ? (
        <Button variant="ghost" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Hide" : "Show"} archived wallets
        </Button>
      ) : null}
      <Modal
        open={editor.isOpen}
        onClose={editor.close}
        returnFocus={editor.trigger}
        {...modalText(editor.value, current)}
      >
        {editor.value?.mode === "create" ? (
          <CreateWallet onSaved={editor.close} />
        ) : null}
        {editor.value?.mode === "edit" && current ? (
          <EditWallet key={current.id} wallet={current} onSaved={editor.close} />
        ) : null}
        {editor.value?.mode === "adjust" && current ? (
          <AdjustWallet key={current.id} wallet={current} onSaved={editor.close} />
        ) : null}
      </Modal>
    </section>
  );
}

function modalText(editor: Editor | undefined, wallet: Wallet | undefined) {
  if (editor?.mode === "edit")
    return {
      title: "Edit wallet",
      description:
        "Use adjustments to change the balance. Currency and wallet type stay fixed.",
    };
  if (editor?.mode === "adjust")
    return {
      title: wallet?.card_type === "credit" ? "Adjust debt" : "Adjust balance",
      description:
        "The difference is recorded with your reason. History stays intact.",
    };
  return {
    title: "Add wallet",
    description: "Start with what you have today. No bank connection needed.",
  };
}

function AdjustWallet(props: { wallet: Wallet; onSaved: () => void }) {
  const writes = useWrites();
  // Snapshot at open: a background refetch must not swap in a newer version, or a
  // concurrent change would be overwritten instead of reported as a conflict.
  const [wallet] = useState(props.wallet);
  const { onSaved } = props;
  return (
    <SaveForm
      onSaved={onSaved}
      label="Record adjustment"
      body={(form) => ({
        version: wallet.version,
        balance: form.decimal("balance"),
        reason: form.text("reason"),
      })}
      send={(body, key) => writes.adjustWallet(wallet.id, body, { key })}
    >
      <MoneyField
        label={wallet.card_type === "credit" ? "Actual debt owed" : "Actual balance"}
        name="balance"
        allowNegative
        defaultValue={wallet.debt ?? wallet.balance}
      />
      <Notes label="Reason" name="reason" required />
    </SaveForm>
  );
}

function CreateWallet({ onSaved }: { onSaved: () => void }) {
  const writes = useWrites();
  const [type, setType] = useState<WalletType>("physical");
  const [cardType, setCardType] = useState<"debit" | "credit">("debit");
  const credit = type === "card" && cardType === "credit";
  return (
    <SaveForm
      onSaved={onSaved}
      label="Create wallet"
      body={(form) => ({
        name: form.text("name"),
        type,
        card_type: (type === "card" ? cardType : "") as CardType,
        currency: form.text("currency") as Currency,
        opening_balance: form.decimal("opening_balance"),
        credit_limit: credit ? form.decimal("credit_limit") : "",
        details: form.text("details"),
      })}
      send={(body, key) => writes.createWallet(body, { key })}
    >
      <TextField
        label="Wallet name"
        name="name"
        required
        maxLength={120}
        placeholder="Cash, bKash, or your bank"
      />
      <Choice
        label="Wallet type"
        name="type"
        value={type}
        onChange={(value) => setType(value as WalletType)}
        options={types}
      />
      {type === "card" ? (
        <Choice
          label="Card type"
          name="card_type"
          value={cardType}
          onChange={(value) => setCardType(value as "debit" | "credit")}
          options={[
            { value: "debit", label: "Debit / prepaid" },
            { value: "credit", label: "Credit" },
          ]}
        />
      ) : null}
      <Choice
        label="Currency"
        name="currency"
        defaultValue="BDT"
        options={[
          { value: "BDT", label: "BDT · Bangladeshi taka" },
          { value: "USD", label: "USD · US dollar" },
        ]}
      />
      <MoneyField
        label={credit ? "Opening debt" : "Opening balance"}
        name="opening_balance"
        allowNegative
        defaultValue="0"
      />
      {credit ? (
        <MoneyField label="Credit limit" name="credit_limit" defaultValue="0" />
      ) : null}
      {type === "card" && cardType === "debit" ? (
        <p className="text-sm text-muted-foreground">
          If this card uses a bank account already listed here, use that bank
          wallet instead. Do not count the same money twice.
        </p>
      ) : null}
      <Notes name="details" label="Account details (optional)" />
    </SaveForm>
  );
}

function EditWallet(props: { wallet: Wallet; onSaved: () => void }) {
  const writes = useWrites();
  // Snapshot at open so the stale-edit check compares against what the user saw.
  const [wallet] = useState(props.wallet);
  const { onSaved } = props;
  return (
    <SaveForm
      onSaved={onSaved}
      label="Save wallet"
      // An explicit input shape: response-only fields such as balance and debt are never
      // echoed back, so a new computed field on the server cannot break wallet edits.
      body={(form) => ({
        id: wallet.id,
        name: form.text("name"),
        type: wallet.type,
        card_type: wallet.card_type,
        currency: wallet.currency,
        details: form.text("details"),
        credit_limit:
          wallet.card_type === "credit" ? form.decimal("credit_limit") : "0.00",
        archived: form.text("status") === "archived",
        version: wallet.version,
      })}
      send={(body, key) => writes.updateWallet(body, { key })}
    >
      <TextField
        label="Wallet name"
        name="name"
        defaultValue={wallet.name}
        required
        maxLength={120}
      />
      {wallet.card_type === "credit" ? (
        <MoneyField
          label="Credit limit"
          name="credit_limit"
          defaultValue={wallet.credit_limit}
        />
      ) : null}
      <Notes
        name="details"
        label="Account details (optional)"
        defaultValue={wallet.details}
      />
      <Choice
        label="Status"
        name="status"
        defaultValue={wallet.archived ? "archived" : "active"}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
      />
    </SaveForm>
  );
}
