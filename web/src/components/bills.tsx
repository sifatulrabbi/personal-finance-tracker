import { useState } from "react";
import { Plus, CalendarDays } from "lucide-react";
import {
  dhakaDate,
  moneyLabel,
  type Bill,
  type Data,
  type Schedule,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Choice,
  MoneyField,
  Notes,
  SaveForm,
  TextField,
  WalletChoice,
  value,
} from "@/components/forms";
import { Modal, NoRecords } from "@/components/layout";
import { CategoryChoice } from "@/components/categories";

type Editor =
  | { type: "create" }
  | { type: "edit"; schedule: Schedule }
  | { type: "pay" | "skip"; bill: Bill };
export function Bills({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const saved = () => {
    setEditor(null);
    onSaved();
  };
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recurring bills</h2>
        <Button
          size="sm"
          disabled={!data.wallets.some((w) => !w.archived)}
          onClick={() => setEditor({ type: "create" })}
        >
          <Plus data-icon="inline-start" />
          Add bill
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Due dates, not automatic payments. Confirm when you have paid.
      </p>
      <h3 className="flex items-center gap-2 font-semibold">
        <CalendarDays className="size-4" />
        Due now <Badge variant="secondary">{data.bills.length}</Badge>
      </h3>
      {!data.bills.length ? (
        <NoRecords
          title="Nothing due"
          description="Your unpaid bills appear here when their due date arrives."
        />
      ) : null}
      {data.bills.map((bill) => {
        const wallet = data.wallets.find((w) => w.id === bill.wallet_id);
        return (
          <Card key={bill.id} role="article" aria-label={`Due ${bill.name}`}>
            <CardHeader>
              <CardTitle>{bill.name}</CardTitle>
              <CardDescription>
                Due {bill.due_date} · {wallet?.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {moneyLabel(bill.amount, wallet?.currency ?? "BDT")}
              </p>
              {bill.note ? (
                <p className="break-words text-sm text-muted-foreground">
                  {bill.note}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setEditor({ type: "pay", bill })}
              >
                Confirm payment
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditor({ type: "skip", bill })}
              >
                Skip
              </Button>
            </CardFooter>
          </Card>
        );
      })}
      <h3 className="mt-3 font-semibold">Your schedules</h3>
      {!data.schedules.length ? (
        <p className="text-sm text-muted-foreground">
          Add rent, Wi-Fi, or another regular bill.
        </p>
      ) : null}
      {data.schedules.map((schedule) => (
        <div
          key={schedule.id}
          className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="break-words font-medium">{schedule.name}</p>
            <p className="text-sm text-muted-foreground">
              {schedule.frequency} ·{" "}
              {moneyLabel(
                schedule.amount,
                data.wallets.find((w) => w.id === schedule.wallet_id)
                  ?.currency ?? "BDT",
              )}
            </p>
            {!schedule.active ? (
              <Badge variant="outline">Inactive</Badge>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit ${schedule.name}`}
            onClick={() => setEditor({ type: "edit", schedule })}
          >
            Edit
          </Button>
        </div>
      ))}
      {editor?.type === "create" ? (
        <Modal
          title="Add recurring bill"
          description="The amount is a default. You can change it when confirming each payment."
          onClose={() => setEditor(null)}
        >
          <ScheduleForm
            data={data}
            onSaved={saved}
            onCategoriesChanged={onSaved}
          />
        </Modal>
      ) : null}
      {editor?.type === "edit" ? (
        <Modal
          title="Edit recurring bill"
          description="Already-due amounts and past payments stay unchanged. To change the frequency, deactivate this schedule and create another."
          onClose={() => setEditor(null)}
        >
          <ScheduleForm
            data={data}
            initial={editor.schedule}
            onSaved={saved}
            onCategoriesChanged={onSaved}
          />
        </Modal>
      ) : null}
      {editor?.type === "pay" ? (
        <Modal
          title={`Pay ${editor.bill.name}`}
          description="Enter the final amount, including any charges. Leave it empty to use the expected amount."
          onClose={() => setEditor(null)}
        >
          <PaymentForm data={data} bill={editor.bill} onSaved={saved} />
        </Modal>
      ) : null}
      {editor?.type === "skip" ? (
        <Modal
          title="Skip this bill"
          description="No money will move. The reason will be kept in the change log."
          onClose={() => setEditor(null)}
        >
          <SaveForm
            path={`/bills/${editor.bill.id}/skip`}
            label="Skip this occurrence"
            onSaved={saved}
            body={(form) => ({ reason: value(form, "reason") })}
          >
            <Notes label="Reason" name="reason" required />
          </SaveForm>
        </Modal>
      ) : null}
    </section>
  );
}

function ScheduleForm({
  data,
  initial,
  onSaved,
  onCategoriesChanged,
}: {
  data: Data;
  initial?: Schedule;
  onSaved: () => void;
  onCategoriesChanged: () => void;
}) {
  const [categoryEditing, setCategoryEditing] = useState(false);
  return (
    <SaveForm
      disabled={categoryEditing}
      path={initial ? `/schedules/${initial.id}` : "/schedules"}
      method={initial ? "PUT" : "POST"}
      label={initial ? "Save bill" : "Create bill"}
      onSaved={onSaved}
      body={(form) => ({
        name: value(form, "name"),
        category_id: value(form, "category_id"),
        amount: value(form, "amount"),
        wallet_id: value(form, "wallet_id"),
        frequency: initial?.frequency ?? value(form, "frequency"),
        start_date: initial?.start_date ?? value(form, "start_date"),
        end_date: value(form, "end_date"),
        note: value(form, "note"),
        ...(initial
          ? {
              id: initial.id,
              version: initial.version,
              active: value(form, "status") === "active",
            }
          : {}),
      })}
    >
      <TextField
        label="Bill name"
        name="name"
        defaultValue={initial?.name}
        required
        maxLength={120}
        placeholder="Rent, Wi-Fi, or electricity"
      />
      <WalletChoice wallets={data.wallets} defaultValue={initial?.wallet_id} />
      <CategoryChoice
        type="expense"
        categories={data.categories}
        initial={initial?.category_id}
        onEditingChange={setCategoryEditing}
        onCreated={onCategoriesChanged}
      />
      <MoneyField
        label="Expected amount"
        name="amount"
        defaultValue={initial?.amount}
      />
      {!initial ? (
        <>
          <Choice
            label="Frequency"
            name="frequency"
            defaultValue="monthly"
            options={[
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
            ]}
          />
          <TextField
            label="First due date"
            name="start_date"
            type="date"
            defaultValue={dhakaDate()}
            required
          />
        </>
      ) : null}
      <TextField
        label="Last due date (optional)"
        name="end_date"
        type="date"
        defaultValue={initial?.end_date}
      />
      <Notes defaultValue={initial?.note} />
      {initial ? (
        <Choice
          label="Status"
          name="status"
          defaultValue={initial.active ? "active" : "inactive"}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
      ) : null}
    </SaveForm>
  );
}

function PaymentForm({
  data,
  bill,
  onSaved,
}: {
  data: Data;
  bill: Bill;
  onSaved: () => void;
}) {
  const active = data.wallets.filter((w) => !w.archived);
  const [walletID, setWalletID] = useState(
    active.some((w) => w.id === bill.wallet_id)
      ? bill.wallet_id
      : (active[0]?.id ?? ""),
  );
  const currency = active.find((w) => w.id === walletID)?.currency;
  const expectedCurrency = data.wallets.find(
    (w) => w.id === bill.wallet_id,
  )?.currency;
  const changedCurrency = currency !== expectedCurrency;
  return (
    <SaveForm
      path={`/bills/${bill.id}/confirm`}
      onSaved={onSaved}
      label="Record payment"
      disabled={!walletID}
      body={(form) => ({
        amount: value(form, "amount"),
        wallet_id: walletID,
        date: value(form, "date"),
        rate: value(form, "rate"),
        note: value(form, "note"),
      })}
    >
      <WalletChoice
        label="Pay from"
        wallets={active}
        value={walletID}
        onChange={setWalletID}
      />
      <MoneyField
        label="Amount paid"
        name="amount"
        required={changedCurrency}
        placeholder={changedCurrency ? "Enter actual amount" : bill.amount}
      />
      <p className="text-sm text-muted-foreground">
        {changedCurrency
          ? `The bill expects ${bill.amount} ${expectedCurrency}. Enter the actual payment in ${currency}.`
          : `Empty amount uses ${bill.amount}. Payment is recorded in ${currency}.`}
      </p>
      {currency === "USD" ? (
        <TextField
          label="Exchange rate (BDT per USD)"
          name="rate"
          type="number"
          step="0.000001"
          min="0.000001"
          inputMode="decimal"
          placeholder={data.settings.rate || "Set a rate"}
          required={!data.settings.rate}
        />
      ) : null}
      <TextField
        label="Payment date"
        name="date"
        type="date"
        defaultValue={dhakaDate()}
        required
      />
      <Notes defaultValue={bill.note} />
    </SaveForm>
  );
}
