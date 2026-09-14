import { useState } from "react";
import { Plus, Pencil, SlidersHorizontal } from "lucide-react";
import { type Wallet, moneyLabel } from "@/lib/api";
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
import {
  Choice,
  MoneyField,
  SaveForm,
  TextField,
  Notes,
  value,
} from "@/components/forms";
import { Modal, NoRecords } from "@/components/layout";

const types = [
  { value: "physical", label: "Physical cash" },
  { value: "bank", label: "Bank account" },
  { value: "digital", label: "Digital wallet" },
  { value: "card", label: "Card" },
];
export function Wallets({
  wallets,
  onSaved,
}: {
  wallets: Wallet[];
  onSaved: () => void;
}) {
  const [editor, setEditor] = useState<{
    mode: "create" | "edit" | "adjust";
    wallet?: Wallet;
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const saved = () => {
    setEditor(null);
    onSaved();
  };
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Your wallets</h2>
        <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
          <Plus data-icon="inline-start" />
          Add wallet
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Cash you hold and credit you owe, kept separate.
      </p>
      {!wallets.length ? (
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
            <CardContent className="flex flex-col gap-2">
              <p className="break-all text-3xl font-semibold tracking-tight tabular-nums">
                {moneyLabel(wallet.debt ?? wallet.balance, wallet.currency)}
              </p>
              {wallet.card_type === "credit" ? (
                <p className="text-sm text-muted-foreground">
                  Available{" "}
                  {moneyLabel(wallet.available_credit!, wallet.currency)} ·
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
                onClick={() => setEditor({ mode: "edit", wallet })}
              >
                <Pencil data-icon="inline-start" />
                Edit wallet
              </Button>
              {!wallet.archived ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditor({ mode: "adjust", wallet })}
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
      {editor?.mode === "create" ? (
        <Modal
          title="Add wallet"
          description="Start with what you have today. No bank connection needed."
          onClose={() => setEditor(null)}
        >
          <CreateWallet onSaved={saved} />
        </Modal>
      ) : null}
      {editor?.mode === "edit" && editor.wallet ? (
        <Modal
          title="Edit wallet"
          description="Use adjustments to change the balance. Currency and wallet type stay fixed."
          onClose={() => setEditor(null)}
        >
          <EditWallet wallet={editor.wallet} onSaved={saved} />
        </Modal>
      ) : null}
      {editor?.mode === "adjust" && editor.wallet ? (
        <Modal
          title={
            editor.wallet.card_type === "credit"
              ? "Adjust debt"
              : "Adjust balance"
          }
          description="The difference is recorded with your reason. History stays intact."
          onClose={() => setEditor(null)}
        >
          <SaveForm
            path={`/wallets/${editor.wallet.id}/adjust`}
            onSaved={saved}
            label="Record adjustment"
            body={(form) => ({
              version: editor.wallet!.version,
              balance: value(form, "balance"),
              reason: value(form, "reason"),
            })}
          >
            <MoneyField
              label={
                editor.wallet.card_type === "credit"
                  ? "Actual debt owed"
                  : "Actual balance"
              }
              name="balance"
              min={undefined}
              defaultValue={editor.wallet.debt ?? editor.wallet.balance}
            />
            <Notes label="Reason" name="reason" required />
          </SaveForm>
        </Modal>
      ) : null}
    </section>
  );
}
function CreateWallet({ onSaved }: { onSaved: () => void }) {
  const [type, setType] = useState("physical");
  const [cardType, setCardType] = useState("debit");
  return (
    <SaveForm
      path="/wallets"
      onSaved={onSaved}
      label="Create wallet"
      body={(form) => ({
        name: value(form, "name"),
        type,
        card_type: type === "card" ? cardType : "",
        currency: value(form, "currency"),
        opening_balance: value(form, "opening_balance"),
        credit_limit: value(form, "credit_limit"),
        details: value(form, "details"),
      })}
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
        onChange={setType}
        options={types}
      />
      {type === "card" ? (
        <Choice
          label="Card type"
          name="card_type"
          value={cardType}
          onChange={setCardType}
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
        label={
          type === "card" && cardType === "credit"
            ? "Opening debt"
            : "Opening balance"
        }
        name="opening_balance"
        min={undefined}
        defaultValue="0"
      />
      {type === "card" && cardType === "credit" ? (
        <MoneyField
          label="Credit limit"
          name="credit_limit"
          min="0"
          defaultValue="0"
        />
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
function EditWallet({
  wallet,
  onSaved,
}: {
  wallet: Wallet;
  onSaved: () => void;
}) {
  return (
    <SaveForm
      path={`/wallets/${wallet.id}`}
      method="PUT"
      onSaved={onSaved}
      label="Save wallet"
      body={(form) => ({
        ...wallet,
        name: value(form, "name"),
        details: value(form, "details"),
        credit_limit:
          wallet.card_type === "credit" ? value(form, "credit_limit") : "0.00",
        archived: value(form, "status") === "archived",
      })}
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
          min="0"
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
