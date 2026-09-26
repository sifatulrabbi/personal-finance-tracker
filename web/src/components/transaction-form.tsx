import { useState } from "react";
import type { Category, Settings, Transaction, Wallet } from "@/api/types";
import { useWrites } from "@/cache/writes";
import { dhakaDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { FieldDescription } from "@/components/ui/field";
import {
  Choice,
  MoneyField,
  Notes,
  RateField,
  SaveForm,
  TextField,
  WalletChoice,
  WarningMessage,
} from "@/components/forms";
import { CategoryChoice } from "@/components/categories";

const kinds = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer / card repayment" },
];

// Adds a record, or corrects one when `initial` is given. Used by the global Add sheet and
// by the record detail sheet in Activity.
export function TransactionForm({
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
  const [walletID, setWalletID] = useState(initial?.wallet_id ?? active[0]?.id ?? "");
  const [toID, setToID] = useState(initial?.to_wallet_id ?? "");
  const targets = active.filter((w) => w.id !== walletID);
  const destination = toID || (targets[0]?.id ?? "");
  const wallet = active.find((w) => w.id === walletID);
  const target = targets.find((w) => w.id === destination);
  const foreign =
    wallet?.currency === "USD" || (kind === "transfer" && target?.currency === "USD");
  const crossCurrency = kind === "transfer" && wallet?.currency !== target?.currency;
  const recordKind = kind as "income" | "expense" | "transfer";
  return (
    <SaveForm
      label={initial ? "Save correction" : "Save record"}
      saved={initial ? "Correction saved" : "Record saved"}
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
        <WarningMessage>
          Choose active wallets before saving. Reactivate an archived wallet in Wallets, or
          explicitly select a replacement. A transfer needs two different wallets.
        </WarningMessage>
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
        currency={wallet?.currency}
        defaultValue={initial?.amount}
        placeholder="0.00"
        hint={`Amount in ${wallet?.currency ?? "your wallet currency"}.${
          wallet?.card_type === "credit" && kind === "expense"
            ? " This increases the card debt."
            : ""
        }`}
      />
      {crossCurrency ? (
        <MoneyField
          label={`Amount received (${target?.currency})`}
          name="received_amount"
          currency={target?.currency}
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
        <FieldDescription>
          For a card repayment, transfer from your bank or cash wallet to the credit card.
          Record a transfer fee as a separate expense.
        </FieldDescription>
      ) : null}
      {initial ? <Notes label="Reason for correction" name="reason" /> : null}
    </SaveForm>
  );
}
