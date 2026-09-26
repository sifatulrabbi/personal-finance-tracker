import { useState, type SyntheticEvent } from "react";
import { cn } from "cn";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleCheck,
  Ellipsis,
  Plus,
  Repeat,
  SkipForward,
} from "lucide-react";
import type {
  Bill,
  Category,
  Frequency,
  Schedule,
  Settings,
  UpcomingBill,
  Wallet,
} from "@/api/types";
import {
  upcomingDays,
  useBillHistory,
  useCategories,
  useDueBills,
  useSchedules,
  useSettings,
  useUpcomingBills,
  useWallets,
} from "@/cache/queries";
import { useWrites } from "@/cache/writes";
import { daysBetween, dhakaDate, dueLabel, fullDate, shortDate } from "@/lib/dates";
import { moneyLabel } from "@/money/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import {
  EmptyState,
  List,
  ListRow,
  ListSkeleton,
  LoadError,
  Modal,
  PageIntro,
  RowIcon,
  Section,
  useEditor,
} from "@/components/layout";
import { Money } from "@/components/money";
import { CategoryChoice } from "@/components/categories";

type Editor =
  | { type: "create" }
  | { type: "edit"; schedule: Schedule }
  | { type: "pay" | "skip"; bill: Bill };

// Upcoming bills this close to today are listed under "Due soon"; later ones under
// "Upcoming".
const soonDays = 7;

export function Bills() {
  const due = useDueBills();
  const upcoming = useUpcomingBills();
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
  // Due dates are Asia/Dhaka calendar dates from the server; today is the Dhaka date too.
  const today = dhakaDate();
  const overdue = bills.filter((bill) => bill.due_date < today);
  const dueToday = bills.filter((bill) => bill.due_date >= today);
  const future = upcoming.data ?? [];
  const soon = future.filter((bill) => daysBetween(today, bill.due_date) <= soonDays);
  const later = future.filter((bill) => daysBetween(today, bill.due_date) > soonDays);
  const walletFor = (id: string) => wallets.find((w) => w.id === id);
  const openPay = (bill: Bill, event: SyntheticEvent<HTMLElement>) =>
    editor.open({ type: "pay", bill }, event);
  const openSkip = (bill: Bill, event?: SyntheticEvent<HTMLElement>) =>
    editor.open({ type: "skip", bill }, event);
  const nothingAhead = due.data && upcoming.data && !bills.length && !future.length;
  return (
    <>
      <PageIntro
        description="Due dates, not automatic payments. Confirm when you have paid."
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={!ready || !wallets.some((w) => !w.archived)}
            onClick={(e) => editor.open({ type: "create" }, e)}
          >
            <Plus data-icon="inline-start" />
            Add bill
          </Button>
        }
      />
      <LoadError
        error={due.error}
        hasData={Boolean(due.data)}
        onRetry={() => void due.refetch()}
        what="due bills"
      />
      <LoadError
        error={upcoming.error}
        hasData={Boolean(upcoming.data)}
        onRetry={() => void upcoming.refetch()}
        what="upcoming bills"
      />
      {due.isPending ? <ListSkeleton rows={3} /> : null}
      {nothingAhead ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="Nothing due"
          description={`No unpaid bills, and none due in the next ${upcomingDays} days.`}
        />
      ) : null}
      {overdue.length ? (
        <section aria-label="Overdue" className="min-w-0">
          <Section
            title={
              <>
                Overdue <Badge variant="warning">{overdue.length}</Badge>
              </>
            }
          >
            <List>
              {overdue.map((bill) => (
                <DueRow
                  key={bill.id}
                  bill={bill}
                  today={today}
                  wallet={walletFor(bill.wallet_id)}
                  ready={ready}
                  onPay={openPay}
                  onSkip={openSkip}
                />
              ))}
            </List>
          </Section>
        </section>
      ) : null}
      {dueToday.length || soon.length ? (
        <section aria-label="Due soon" className="min-w-0">
          <Section title="Due soon">
            <List>
              {dueToday.map((bill) => (
                <DueRow
                  key={bill.id}
                  bill={bill}
                  today={today}
                  wallet={walletFor(bill.wallet_id)}
                  ready={ready}
                  onPay={openPay}
                  onSkip={openSkip}
                />
              ))}
              {soon.map((bill) => (
                <UpcomingRow
                  key={`${bill.schedule_id}-${bill.due_date}`}
                  bill={bill}
                  today={today}
                  wallet={walletFor(bill.wallet_id)}
                />
              ))}
            </List>
          </Section>
        </section>
      ) : null}
      {later.length ? (
        <section aria-label="Upcoming" className="min-w-0">
          <Section title="Upcoming">
            <List>
              {later.map((bill) => (
                <UpcomingRow
                  key={`${bill.schedule_id}-${bill.due_date}`}
                  bill={bill}
                  today={today}
                  wallet={walletFor(bill.wallet_id)}
                />
              ))}
            </List>
            <p className="text-caption font-normal text-muted-foreground">
              Bills appear here up to {upcomingDays} days ahead. You can pay one once it is due.
            </p>
          </Section>
        </section>
      ) : null}
      <BillHistory wallets={wallets} />
      <section aria-label="Your schedules" className="min-w-0">
        <Section title="Your schedules">
          <LoadError
            error={schedulesQuery.error}
            hasData={Boolean(schedulesQuery.data)}
            onRetry={() => void schedulesQuery.refetch()}
            what="schedules"
          />
          {schedulesQuery.isPending ? <ListSkeleton rows={2} /> : null}
          {schedulesQuery.data && !schedules.length ? (
            <p className="text-sm text-muted-foreground">
              Add rent, Wi-Fi, or another regular bill.
            </p>
          ) : null}
          {schedules.length ? (
            <List>
              {schedules.map((schedule) => (
                <ListRow
                  key={schedule.id}
                  data-testid="schedule-row"
                  className={schedule.active ? undefined : "opacity-75"}
                  leading={
                    <RowIcon>
                      <Repeat />
                    </RowIcon>
                  }
                  title={
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 break-words">{schedule.name}</span>
                      {!schedule.active ? <Badge variant="outline">Paused</Badge> : null}
                    </span>
                  }
                  subtitle={
                    <>
                      <span className="capitalize">{schedule.frequency}</span> ·{" "}
                      {moneyLabel(
                        schedule.amount,
                        walletFor(schedule.wallet_id)?.currency ?? "BDT",
                      )}
                      {nextDue(schedule, bills, future, today)}
                    </>
                  }
                  trailing={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary"
                      aria-label={`Edit ${schedule.name}`}
                      disabled={!ready}
                      onClick={(e) => editor.open({ type: "edit", schedule }, e)}
                    >
                      Edit
                    </Button>
                  }
                />
              ))}
            </List>
          ) : null}
        </Section>
      </section>
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
            saved="Bill skipped"
            onSaved={editor.close}
            body={(form) => ({ reason: form.text("reason") })}
            send={(body, key) => writes.skipBill(value.bill.id, body, { key })}
          >
            <p className="text-sm text-muted-foreground">
              {value.bill.name}, due {fullDate(value.bill.due_date)},{" "}
              {moneyLabel(value.bill.amount, walletFor(value.bill.wallet_id)?.currency ?? "BDT")}.
            </p>
            <Notes label="Reason" name="reason" required />
          </SaveForm>
        ) : null}
      </Modal>
    </>
  );
}

function nextDue(schedule: Schedule, due: Bill[], future: UpcomingBill[], today: string) {
  if (!schedule.active) return " · no new bills while paused";
  if (due.some((bill) => bill.schedule_id === schedule.id)) return " · due now";
  const next = future.find((bill) => bill.schedule_id === schedule.id);
  return next ? ` · next ${shortDate(next.due_date, today)}` : "";
}

// An unpaid occurrence: how late it is, what it costs, and Pay. Skip is in its menu.
function DueRow({
  bill,
  today,
  wallet,
  ready,
  onPay,
  onSkip,
}: {
  bill: Bill;
  today: string;
  wallet: Wallet | undefined;
  ready: boolean;
  onPay: (bill: Bill, event: SyntheticEvent<HTMLElement>) => void;
  onSkip: (bill: Bill, event?: SyntheticEvent<HTMLElement>) => void;
}) {
  const label = dueLabel(bill.due_date, today);
  const [menuTrigger, setMenuTrigger] = useState<HTMLElement | null>(null);
  return (
    <div
      role="article"
      aria-label={`Due ${bill.name}`}
      className="flex min-h-16 min-w-0 items-center gap-3 px-4 py-3"
    >
      <div className="shrink-0 max-[379px]:hidden">
        <RowIcon tone={label.tone === "overdue" ? "warning" : "primary"}>
          {label.tone === "overdue" ? <CalendarX /> : <CalendarClock />}
        </RowIcon>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="min-w-0 break-words font-medium">{bill.name}</p>
        <p className="min-w-0 break-words text-label font-normal text-muted-foreground">
          <span
            data-testid="due-label"
            className={cn(label.tone === "overdue" && "font-medium text-warning")}
          >
            {label.text}
          </span>
          {wallet ? ` · ${wallet.name}` : ""}
        </p>
        {bill.note ? (
          <p className="min-w-0 truncate text-caption font-normal text-muted-foreground">
            {bill.note}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Money className="font-semibold" amount={bill.amount} currency={wallet?.currency ?? "BDT"} />
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
           
            disabled={!ready}
            onClick={(event) => onPay(bill, event)}
          >
            Pay
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={setMenuTrigger}
                size="icon"
                variant="ghost"
                className="-mr-2 text-muted-foreground"
                aria-label={`More actions for ${bill.name}`}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="data-[state=closed]:animate-none">
              <DropdownMenuItem
                // Focus returns to the menu button once the skip sheet closes.
                onSelect={() => {
                  if (menuTrigger) menuTrigger.focus();
                  onSkip(bill);
                }}
              >
                <SkipForward aria-hidden />
                Skip this bill
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// A future occurrence. It has no id until it comes due, so it cannot be paid yet.
function UpcomingRow({
  bill,
  today,
  wallet,
}: {
  bill: UpcomingBill;
  today: string;
  wallet: Wallet | undefined;
}) {
  const label = dueLabel(bill.due_date, today);
  return (
    <ListRow
      data-testid="upcoming-row"
      leading={
        <RowIcon>
          <CalendarClock />
        </RowIcon>
      }
      title={bill.name}
      subtitle={`${label.text} · ${shortDate(bill.due_date, today)}${wallet ? ` · ${wallet.name}` : ""}`}
      trailing={
        <Money
          className="font-medium text-muted-foreground"
          amount={bill.amount}
          currency={wallet?.currency ?? "BDT"}
        />
      }
    />
  );
}

// Paid and skipped bills, newest first. Loaded only once the section is looked at.
function BillHistory({ wallets }: { wallets: Wallet[] }) {
  const [status, setStatus] = useState<"paid" | "skipped">("paid");
  const history = useBillHistory(status);
  const rows = history.data?.pages.flat() ?? [];
  return (
    <section aria-label="History" className="min-w-0">
      <Section
        title="History"
        action={
          <ToggleGroup
            type="single"
            aria-label="Show bills"
            value={status}
            onValueChange={(next) => next && setStatus(next as "paid" | "skipped")}
          >
            <ToggleGroupItem value="paid">Paid</ToggleGroupItem>
            <ToggleGroupItem value="skipped">Skipped</ToggleGroupItem>
          </ToggleGroup>
        }
      >
        <LoadError
          error={history.error}
          hasData={Boolean(history.data)}
          onRetry={() => void history.refetch()}
          what="bill history"
        />
        {history.isPending ? <ListSkeleton rows={2} /> : null}
        {history.data && !rows.length ? (
          <p className="text-sm text-muted-foreground">
            {status === "paid" ? "No paid bills yet." : "No skipped bills."}
          </p>
        ) : null}
        {rows.length ? (
          <List data-testid="bill-history">
            {rows.map((bill) => {
              const currency = wallets.find((w) => w.id === bill.wallet_id)?.currency ?? "BDT";
              return (
                <ListRow
                  key={bill.id}
                  leading={
                    <RowIcon tone={status === "paid" ? "income" : "neutral"}>
                      {status === "paid" ? <CircleCheck /> : <SkipForward />}
                    </RowIcon>
                  }
                  title={bill.name}
                  subtitle={`${status === "paid" ? "Paid" : "Skipped"} · due ${fullDate(bill.due_date)}`}
                  trailing={
                    <Money
                      className={cn("font-medium", status === "skipped" && "text-muted-foreground")}
                      amount={bill.amount}
                      currency={currency}
                    />
                  }
                />
              );
            })}
          </List>
        ) : null}
        {history.hasNextPage ? (
          <Button
            variant="outline"
            className="self-center"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage ? "Loading…" : "Show older bills"}
          </Button>
        ) : null}
      </Section>
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
      saved={initial ? "Bill saved" : "Bill created"}
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
        <WarningMessage>
          This wallet is archived or unavailable. Reactivate it in Wallets, or explicitly
          select an active wallet before saving.
        </WarningMessage>
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
        currency={wallets.find((w) => w.id === walletID)?.currency}
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
            { value: "inactive", label: "Paused (no new bills)" },
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
      saved="Payment recorded"
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
        <WarningMessage>
          This wallet is archived or unavailable. Reactivate it in Wallets, or explicitly
          choose an active payment wallet.
        </WarningMessage>
      )}
      <MoneyField
        label="Amount paid"
        name="amount"
        currency={currency}
        required={changedCurrency}
        placeholder={changedCurrency ? "Enter actual amount" : bill.amount}
        hint={
          changedCurrency
            ? `The bill expects ${bill.amount} ${expectedCurrency}. Enter the actual payment in ${currency}.`
            : `Empty amount uses ${bill.amount}. Payment is recorded in ${currency}.`
        }
      />
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
