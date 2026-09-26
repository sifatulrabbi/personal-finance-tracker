import { useState } from "react";
import { Plus, CalendarDays } from "lucide-react";
import type { Bill, Category, Frequency, Schedule, Settings, Wallet } from "@/api/types";
import {
  useCategories,
  useDueBills,
  useSchedules,
  useSettings,
  useWallets,
} from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { dhakaDate } from "@/lib/dates";
import { moneyLabel } from "@/money/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

type Editor =
  | { type: "create" }
  | { type: "edit"; schedule: Schedule }
  | { type: "pay" | "skip"; bill: Bill };

export function Bills() {
  const due = useDueBills();
  const schedulesQuery = useSchedules();
  const walletsQuery = useWallets();
  const categoriesQuery = useCategories();
  const settingsQuery = useSettings();
  const wallets = walletsQuery.data ?? [];
  const bills = due.data ?? [];
  const schedules = schedulesQuery.data ?? [];
  const editor = useEditor<Editor>();
  const writes = useWrites();
  const ready = Boolean(walletsQuery.data && categoriesQuery.data && settingsQuery.data);
  const value = editor.value;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeading>Recurring bills</PageHeading>
        <Button
          size="sm"
          disabled={!ready || !wallets.some((w) => !w.archived)}
          onClick={(e) => editor.open({ type: "create" }, e)}
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
        Due now <Badge variant="secondary">{bills.length}</Badge>
      </h3>
      <LoadError
        error={due.error}
        hasData={Boolean(due.data)}
        onRetry={() => void due.refetch()}
        what="due bills"
      />
      {due.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {due.data && !bills.length ? (
        <NoRecords
          title="Nothing due"
          description="Your unpaid bills appear here when their due date arrives."
        />
      ) : null}
      {bills.map((bill) => {
        const wallet = wallets.find((w) => w.id === bill.wallet_id);
        return (
          <Card key={bill.id} role="article" aria-label={`Due ${bill.name}`}>
            <CardHeader>
              <CardTitle>{bill.name}</CardTitle>
              <CardDescription>
                Due {bill.due_date} · {wallet?.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold whitespace-nowrap tabular-nums">
                {moneyLabel(bill.amount, wallet?.currency ?? "BDT")}
              </p>
              {bill.note ? (
                <p className="break-words text-sm text-muted-foreground">
                  {bill.note}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row">
              <Button
                className="w-full sm:w-auto"
                size="sm"
                disabled={!ready}
                onClick={(e) => editor.open({ type: "pay", bill }, e)}
              >
                Confirm payment
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="ghost"
                size="sm"
                onClick={(e) => editor.open({ type: "skip", bill }, e)}
              >
                Skip
              </Button>
            </CardFooter>
          </Card>
        );
      })}
      <h3 className="mt-3 font-semibold">Your schedules</h3>
      <LoadError
        error={schedulesQuery.error}
        hasData={Boolean(schedulesQuery.data)}
        onRetry={() => void schedulesQuery.refetch()}
        what="schedules"
      />
      {schedulesQuery.data && !schedules.length ? (
        <p className="text-sm text-muted-foreground">
          Add rent, Wi-Fi, or another regular bill.
        </p>
      ) : null}
      {schedules.map((schedule) => (
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
                wallets.find((w) => w.id === schedule.wallet_id)?.currency ?? "BDT",
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
            disabled={!ready}
            onClick={(e) => editor.open({ type: "edit", schedule }, e)}
          >
            Edit
          </Button>
        </div>
      ))}
      <Modal
        open={editor.isOpen}
        onClose={editor.close}
        returnFocus={editor.trigger}
        {...modalText(value)}
      >
        {ready && value?.type === "create" ? (
          <ScheduleForm
            wallets={wallets}
            categories={categoriesQuery.data!}
            onSaved={editor.close}
          />
        ) : null}
        {ready && value?.type === "edit" ? (
          <ScheduleForm
            key={value.schedule.id}
            wallets={wallets}
            categories={categoriesQuery.data!}
            initial={value.schedule}
            onSaved={editor.close}
          />
        ) : null}
        {ready && value?.type === "pay" ? (
          <PaymentForm
            key={value.bill.id}
            wallets={wallets}
            settings={settingsQuery.data!}
            bill={value.bill}
            onSaved={editor.close}
          />
        ) : null}
        {value?.type === "skip" ? (
          <SaveForm
            key={value.bill.id}
            label="Skip this occurrence"
            onSaved={editor.close}
            body={(form) => ({ reason: form.text("reason") })}
            send={(body, key) => writes.skipBill(value.bill.id, body, { key })}
          >
            <Notes label="Reason" name="reason" required />
          </SaveForm>
        ) : null}
      </Modal>
    </section>
  );
}

function modalText(value: Editor | undefined) {
  switch (value?.type) {
    case "edit":
      return {
        title: "Edit recurring bill",
        description:
          "Already-due amounts and past payments stay unchanged. To change the frequency, deactivate this schedule and create another.",
      };
    case "pay":
      return {
        title: `Pay ${value.bill.name}`,
        description:
          "Enter the final amount, including any charges. Leave it empty to use the expected amount.",
      };
    case "skip":
      return {
        title: "Skip this bill",
        description: "No money will move. The reason will be kept in the change log.",
      };
    default:
      return {
        title: "Add recurring bill",
        description:
          "The amount is a default. You can change it when confirming each payment.",
      };
  }
}

function ScheduleForm({
  wallets,
  categories,
  initial,
  onSaved,
}: {
  wallets: Wallet[];
  categories: Category[];
  initial?: Schedule;
  onSaved: () => void;
}) {
  const writes = useWrites();
  const [categoryEditing, setCategoryEditing] = useState(false);
  const [walletID, setWalletID] = useState(
    initial?.wallet_id ?? wallets.find((w) => !w.archived)?.id ?? "",
  );
  const walletAvailable = wallets.some((w) => w.id === walletID && !w.archived);
  return (
    <SaveForm
      disabled={categoryEditing || !walletAvailable}
      label={initial ? "Save bill" : "Create bill"}
      onSaved={onSaved}
      body={(form) => ({
        input: {
          name: form.text("name"),
          category_id: form.text("category_id"),
          amount: form.decimal("amount"),
          wallet_id: walletID,
          frequency: (initial?.frequency ?? form.text("frequency")) as Frequency,
          start_date: initial?.start_date ?? form.text("start_date"),
          end_date: form.text("end_date"),
          note: form.text("note"),
        },
        active: form.text("status") === "active",
      })}
      send={({ input, active }, key) =>
        initial
          ? writes.updateSchedule(
              { ...input, id: initial.id, version: initial.version, active },
              { key },
            )
          : writes.createSchedule(input, { key })
      }
    >
      <TextField
        label="Bill name"
        name="name"
        defaultValue={initial?.name}
        required
        maxLength={120}
        placeholder="Rent, Wi-Fi, or electricity"
      />
      <WalletChoice wallets={wallets} value={walletID} onChange={setWalletID} />
      {!walletAvailable && (
        <ErrorMessage error="This wallet is archived or unavailable. Reactivate it in Wallets, or explicitly select an active wallet before saving." />
      )}
      <CategoryChoice
        type="expense"
        categories={categories}
        initial={initial?.category_id}
        onEditingChange={setCategoryEditing}
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
  wallets,
  settings,
  bill,
  onSaved,
}: {
  wallets: Wallet[];
  settings: Settings;
  bill: Bill;
  onSaved: () => void;
}) {
  const writes = useWrites();
  const active = wallets.filter((w) => !w.archived);
  const [walletID, setWalletID] = useState(bill.wallet_id);
  const walletAvailable = active.some((w) => w.id === walletID);
  const currency = active.find((w) => w.id === walletID)?.currency;
  const expectedCurrency = wallets.find((w) => w.id === bill.wallet_id)?.currency;
  const changedCurrency = currency !== expectedCurrency;
  return (
    <SaveForm
      onSaved={onSaved}
      label="Record payment"
      disabled={!walletAvailable}
      body={(form) => ({
        // Empty means "use the expected amount" (ADR 0004). Text that does not parse, such
        // as "1020,50", throws here and is shown as an error; it is never sent as empty.
        amount: form.decimal("amount"),
        wallet_id: walletID,
        date: form.text("date"),
        rate: currency === "USD" ? form.decimal("rate") : "",
        note: form.text("note"),
      })}
      send={(body, key) => writes.confirmBill(bill.id, body, { key })}
    >
      <WalletChoice
        label="Pay from"
        wallets={wallets}
        value={walletID}
        onChange={setWalletID}
      />
      {!walletAvailable && (
        <ErrorMessage error="This wallet is archived or unavailable. Reactivate it in Wallets, or explicitly choose an active payment wallet." />
      )}
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
        <RateField
          label="Exchange rate (BDT per USD)"
          name="rate"
          placeholder={settings.rate || "Set a rate"}
          required={!settings.rate}
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
