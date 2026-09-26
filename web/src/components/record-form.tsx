import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "cn";
import { CircleAlert, History, Plus } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import { mutationKey, type MutationKey } from "@/api/idempotency";
import type { Category, Currency, Settings, Transaction, Wallet } from "@/api/types";
import { useWrites } from "@/cache/writes";
import {
  buildInput,
  changedFields,
  draftFromRecord,
  isCrossCurrency,
  newDraft,
  othersCategory,
  reapplyEdits,
  showsRate,
  isDraftField,
  type DraftField,
  type FieldErrors,
  type RecordDraft,
  type RecordKind,
} from "@/activity/draft";
import { previousDay } from "@/activity/days";
import { recentFirst, recentPicks, rememberPick } from "@/activity/recent";
import { dhakaDate } from "@/lib/dates";
import { parseDecimalInput } from "@/money/decimal";
import { currencySymbol } from "@/money/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorMessage, WarningMessage } from "@/components/forms";
import { notifySaved } from "@/components/feedback";
import { useInSheet } from "@/components/layout";
import { ChipButton, ChipGroup, Segmented, type PickOption } from "@/components/pickers";

const kindOptions: PickOption[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const fieldLabels: Record<DraftField, string> = {
  amount: "amount",
  wallet_id: "wallet",
  to_wallet_id: "destination",
  category_id: "category",
  date: "date",
  note: "note",
  received_amount: "received amount",
  rate: "rate",
  reason: "reason",
};

// How many category chips show before "Show all".
const collapsedCategories = 8;

function walletOption(wallet: Wallet, disabled = false): PickOption {
  const details = [
    wallet.currency === "USD" ? "USD" : "",
    wallet.card_type === "credit" ? "Credit" : "",
    wallet.archived ? "Archived" : "",
  ].filter(Boolean);
  return {
    value: wallet.id,
    label: wallet.name,
    detail: details.join(" · ") || undefined,
    disabled: disabled || wallet.archived,
  };
}

function listSentence(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Adds a record, or corrects `record`. The form edits a plain draft (activity/draft.ts), so
// a 409 can reload the latest version and put the user's edits back on top of it for review.
// Server field errors are shown at the field they name.
export function RecordForm({
  wallets,
  categories,
  settings,
  record,
  initialKind,
  onSaved,
}: {
  wallets: Wallet[];
  categories: Category[];
  settings: Settings;
  record?: Transaction;
  initialKind?: RecordKind;
  onSaved: (record: Transaction) => void;
}) {
  const writes = useWrites();
  const inSheet = useInSheet();
  const [today] = useState(() => dhakaDate());
  const [recentWallets] = useState(() => recentPicks("wallet"));
  const [recentCategories] = useState(() => recentPicks("category"));
  const active = useMemo(
    () => recentFirst(wallets.filter((w) => !w.archived), recentWallets),
    [wallets, recentWallets],
  );
  // The version this correction is checked against. It changes only when the user asks to
  // load the latest version after a conflict.
  const [base, setBase] = useState(record);
  const baseDraft = useMemo(() => (base ? draftFromRecord(base) : undefined), [base]);
  const [draft, setDraft] = useState<RecordDraft>(() =>
    record
      ? draftFromRecord(record)
      : newDraft({ kind: initialKind, wallet_id: active[0]?.id, date: today }),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState<"none" | "stale" | "loading" | "reloaded">("none");
  const [kept, setKept] = useState<DraftField[]>([]);
  const [busy, setBusy] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [allCategories, setAllCategories] = useState(false);
  const lastKey = useRef<MutationKey | undefined>(undefined);
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  const kind = draft.kind;
  const transfer = kind === "transfer";
  const from = wallets.find((w) => w.id === draft.wallet_id);
  const to = wallets.find((w) => w.id === draft.to_wallet_id);
  const currencies = { from: from?.currency, to: transfer ? to?.currency : undefined };
  const cross = isCrossCurrency(kind, currencies);
  const rateShown = showsRate(kind, currencies);
  const shown: Record<DraftField, boolean> = {
    amount: true,
    wallet_id: true,
    to_wallet_id: transfer,
    category_id: !transfer,
    date: true,
    note: true,
    received_amount: cross,
    rate: rateShown,
    reason: Boolean(base),
  };

  function update<F extends keyof RecordDraft>(field: F, value: RecordDraft[F]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field as DraftField];
      return next;
    });
  }

  function focusField(field: DraftField) {
    // After React has rendered the error, so aria-describedby points at it.
    requestAnimationFrame(() => {
      const scope = form.current?.querySelector(`[data-field="${field}"]`);
      const target =
        scope?.querySelector<HTMLElement>("input:checked:not(:disabled)") ??
        scope?.querySelector<HTMLElement>("input:not(:disabled), textarea, select");
      target?.focus();
    });
  }

  function changeKind(next: string) {
    const nextKind = next as RecordKind;
    setDraft((current) => ({
      ...current,
      kind: nextKind,
      category_id: othersCategory(nextKind),
      to_wallet_id: nextKind === "transfer" ? current.to_wallet_id : "",
    }));
    setErrors({});
    setCreatingCategory(false);
    setAllCategories(false);
  }

  function changeFrom(id: string) {
    update("wallet_id", id);
    if (id === draft.to_wallet_id) update("to_wallet_id", "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || busy) return;
    const built = buildInput(draft, currencies);
    if (!built.ok) {
      setErrors(built.errors);
      setFormError("");
      const first = (Object.keys(built.errors) as DraftField[])[0];
      if (first) focusField(first);
      return;
    }
    const correction = base ? { ...built.input, version: base.version } : undefined;
    const body = correction ?? built.input;
    // The same key is reused only when retrying an identical body.
    lastKey.current = mutationKey(lastKey.current, base ? `correct:${base.id}` : "record", body);
    inFlight.current = true;
    setBusy(true);
    setFormError("");
    try {
      const saved = base
        ? await writes.correctTransaction(base.id, correction!, { key: lastKey.current.key })
        : await writes.createTransaction(built.input, { key: lastKey.current.key });
      // The next, separate submission must never replay this response.
      lastKey.current = undefined;
      rememberPick("wallet", draft.wallet_id);
      if (!transfer) rememberPick("category", draft.category_id);
      notifySaved(base ? "Correction saved" : "Record saved");
      onSaved(saved);
    } catch (problem) {
      if (isApiError(problem) && problem.code === "stale_version" && base) {
        setConflict("stale");
      } else if (isApiError(problem) && isDraftField(problem.field) && shown[problem.field]) {
        setErrors({ [problem.field]: problem.message });
        focusField(problem.field);
      } else {
        setFormError(errorMessage(problem, "Could not save. Your entry is still here; try again."));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Someone saved a newer version: load it and put this user's edits back on top.
  async function loadLatest() {
    if (!base || !baseDraft) return;
    setConflict("loading");
    setFormError("");
    try {
      const latest = await writes.refreshTransaction(base.id);
      setKept(changedFields(baseDraft, draft));
      setDraft(reapplyEdits(baseDraft, draft, draftFromRecord(latest)));
      setBase(latest);
      setErrors({});
      lastKey.current = undefined;
      setConflict("reloaded");
    } catch (problem) {
      setConflict("stale");
      setFormError(errorMessage(problem, "Could not load the latest version. Try again."));
    }
  }

  const voidedMeanwhile = Boolean(base?.voided);
  const archivedInUse = [from, transfer ? to : undefined].filter((w) => w?.archived);
  const walletOptions = (current: string, exclude?: string) => {
    const list = active.filter((w) => w.id !== exclude).map((w) => walletOption(w));
    // A record on an archived wallet shows it, selected but not choosable for anything else.
    const archived = wallets.find((w) => w.id === current && w.archived);
    return archived ? [walletOption(archived, true), ...list] : list;
  };
  const typeCategories = recentFirst(
    categories.filter((c) => c.type === kind),
    recentCategories,
  );
  const visibleCategories =
    allCategories || typeCategories.length <= collapsedCategories
      ? typeCategories
      : [
          ...typeCategories.slice(0, collapsedCategories),
          ...typeCategories.slice(collapsedCategories).filter((c) => c.id === draft.category_id),
        ];

  const footer = (
    <>
      {conflict === "stale" || conflict === "loading" ? (
        <Alert variant="warning" role="alert">
          <History aria-hidden />
          <AlertTitle>Someone changed this record</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>
              Your edits are still here. Load the latest version to see what changed; your
              edits are put back on top for you to review before saving.
            </span>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={conflict === "loading"}
              onClick={() => void loadLatest()}
            >
              {conflict === "loading" ? "Loading…" : "Load latest and keep my edits"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {conflict === "reloaded" && base ? (
        <Alert role="status">
          <History aria-hidden />
          <AlertTitle>Loaded version {base.version}</AlertTitle>
          <AlertDescription>
            {kept.length
              ? `Your changes to the ${listSentence(kept.map((f) => fieldLabels[f]))} are kept on top of it. Review, then save.`
              : "You had not changed anything yet. Review the latest values, then save."}
          </AlertDescription>
        </Alert>
      ) : null}
      {voidedMeanwhile ? (
        <ErrorMessage error="This record was voided meanwhile, so it can no longer be corrected." />
      ) : null}
      <ErrorMessage error={formError} />
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={
          busy ||
          creatingCategory ||
          voidedMeanwhile ||
          conflict === "stale" ||
          conflict === "loading"
        }
      >
        {busy ? "Saving…" : base ? "Save correction" : "Save record"}
      </Button>
    </>
  );

  return (
    <form ref={form} onSubmit={submit} noValidate data-sheet-form="">
      <div className="flex min-w-0 flex-col gap-5">
        {base ? (
          <Badge variant="secondary" className="text-sm">
            Correcting {kind}
          </Badge>
        ) : (
          <Segmented
            legend="Record type"
            field="kind"
            value={kind}
            onChange={changeKind}
            options={kindOptions}
          />
        )}
        <AmountField
          value={draft.amount}
          onChange={(value) => update("amount", value)}
          onInvalid={(message) => setErrors((current) => ({ ...current, amount: message }))}
          currency={from?.currency}
          error={errors.amount}
          hint={
            from?.card_type === "credit" && kind === "expense"
              ? "This increases the card debt."
              : undefined
          }
        />
        <ChipGroup
          legend={transfer ? "From wallet" : "Wallet"}
          field="wallet_id"
          value={draft.wallet_id}
          onChange={changeFrom}
          options={walletOptions(draft.wallet_id)}
          error={errors.wallet_id}
        />
        {transfer ? (
          <ChipGroup
            legend="To wallet"
            field="to_wallet_id"
            value={draft.to_wallet_id}
            onChange={(id) => update("to_wallet_id", id)}
            options={walletOptions(draft.to_wallet_id, draft.wallet_id)}
            error={errors.to_wallet_id}
            hint="For a card repayment, send from your bank or cash to the credit card. Record any fee as a separate expense."
          />
        ) : null}
        {archivedInUse.length ? (
          <WarningMessage>
            {archivedInUse.map((w) => w!.name).join(" and ")} {archivedInUse.length > 1 ? "are" : "is"}{" "}
            archived. A note, date or category fix can stay there; to change the amount, choose an
            active wallet.
          </WarningMessage>
        ) : null}
        {cross ? (
          <DecimalField
            label={`Amount received (${to?.currency})`}
            field="received_amount"
            value={draft.received_amount}
            onChange={(value) => update("received_amount", value)}
            onInvalid={(message) => setErrors((current) => ({ ...current, received_amount: message }))}
            currency={to?.currency}
            placeholder="Worked out from the rate"
            hint="What actually arrived. Leave empty to work it out from the rate."
            error={errors.received_amount}
          />
        ) : null}
        {rateShown ? (
          <DecimalField
            label="Exchange rate (BDT per USD)"
            field="rate"
            value={draft.rate}
            onChange={(value) => update("rate", value)}
            onInvalid={(message) => setErrors((current) => ({ ...current, rate: message }))}
            maxFraction={6}
            placeholder={settings.rate ? `Default ${settings.rate}` : "No default rate set"}
            hint="Leave empty to use the default rate. Each record keeps its own rate."
            error={errors.rate}
          />
        ) : null}
        {!transfer ? (
          <ChipGroup
            legend="Category"
            field="category_id"
            value={draft.category_id}
            onChange={(id) => update("category_id", id)}
            options={visibleCategories.map((c) => ({ value: c.id, label: c.name }))}
            error={errors.category_id}
            trailing={
              <>
                {visibleCategories.length < typeCategories.length ? (
                  <ChipButton onClick={() => setAllCategories(true)}>
                    Show all {typeCategories.length}
                  </ChipButton>
                ) : null}
                {!creatingCategory ? (
                  <ChipButton onClick={() => setCreatingCategory(true)}>
                    <Plus aria-hidden />
                    New category
                  </ChipButton>
                ) : null}
              </>
            }
          />
        ) : null}
        {!transfer && creatingCategory ? (
          <NewCategory
            type={kind}
            onCancel={() => setCreatingCategory(false)}
            onCreated={(category) => {
              update("category_id", category.id);
              setCreatingCategory(false);
            }}
          />
        ) : null}
        <DateField
          value={draft.date}
          today={today}
          onChange={(value) => update("date", value)}
          error={errors.date}
        />
        <TextArea
          label="Note"
          field="note"
          value={draft.note}
          onChange={(value) => update("note", value)}
          maxLength={1800}
          error={errors.note}
          placeholder="Optional"
        />
        {base ? (
          <TextArea
            label="Reason for correction"
            field="reason"
            value={draft.reason}
            onChange={(value) => update("reason", value)}
            maxLength={500}
            error={errors.reason}
            placeholder="Optional, kept in the history"
          />
        ) : null}
      </div>
      {inSheet ? (
        // Pinned to the bottom of the sheet, so Save and any error stay reachable with the
        // keyboard open.
        <div
          data-slot="sheet-footer"
          className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-col gap-3 border-t bg-card px-4 py-3 sm:-mx-5 sm:px-5"
        >
          {footer}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">{footer}</div>
      )}
    </form>
  );
}

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-destructive">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  ) : null;
}

// Checks the typed text once the field loses focus, so a mistake shows before Save.
function checkOnBlur(value: string, maxFraction: number, onInvalid: (message: string) => void) {
  const result = parseDecimalInput(value, { maxFraction });
  if (result.kind === "invalid") onInvalid(result.message);
}

// The amount, first and large. A text field (not type="number"): see MoneyField in forms.tsx.
function AmountField({
  value,
  onChange,
  onInvalid,
  currency,
  error,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  onInvalid: (message: string) => void;
  currency?: Currency;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ");
  return (
    <div data-field="amount" className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        Amount
      </label>
      <div className="relative min-w-0">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-title text-muted-foreground"
        >
          {currencySymbol[currency ?? "BDT"]}
        </span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="0.00"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => checkOnBlur(event.currentTarget.value, 2, onInvalid)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="h-16 pl-11 text-[2rem] leading-none font-semibold tabular-nums"
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function DecimalField({
  label,
  field,
  value,
  onChange,
  onInvalid,
  currency,
  maxFraction = 2,
  placeholder,
  hint,
  error,
}: {
  label: string;
  field: DraftField;
  value: string;
  onChange: (value: string) => void;
  onInvalid: (message: string) => void;
  currency?: Currency;
  maxFraction?: number;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ");
  return (
    <div data-field={field} className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      <div className="relative min-w-0">
        {currency ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground"
          >
            {currencySymbol[currency]}
          </span>
        ) : null}
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => checkOnBlur(event.currentTarget.value, maxFraction, onInvalid)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn("tabular-nums", currency && "pl-8")}
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

// Today and Yesterday are one tap; any other date uses the native picker next to them.
function DateField({
  value,
  today,
  onChange,
  error,
}: {
  value: string;
  today: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  const yesterday = previousDay(today);
  return (
    <div data-field="date" className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        Date
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ChipButton pressed={value === today} onClick={() => onChange(today)}>
          Today
        </ChipButton>
        <ChipButton pressed={value === yesterday} onClick={() => onChange(yesterday)}>
          Yesterday
        </ChipButton>
        <Input
          id={id}
          type="date"
          value={value}
          required
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-auto min-w-[10rem] flex-1"
        />
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function TextArea({
  label,
  field,
  value,
  onChange,
  maxLength,
  error,
  placeholder,
}: {
  label: string;
  field: DraftField;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div data-field={field} className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        rows={2}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-16"
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

// Creates a category without leaving the record: the amount and note typed so far stay.
function NewCategory({
  type,
  onCreated,
  onCancel,
}: {
  type: Category["type"];
  onCreated: (category: Category) => void;
  onCancel: () => void;
}): ReactNode {
  const writes = useWrites();
  const id = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<MutationKey | undefined>(undefined);
  const inFlight = useRef(false);
  async function create() {
    if (inFlight.current || !name.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const body = { name, type };
    key.current = mutationKey(key.current, "category", body);
    try {
      const category = await writes.createCategory(body, { key: key.current.key });
      // A new name typed later is a new request, not a replay of this one.
      key.current = undefined;
      onCreated(category);
    } catch (problem) {
      setError(
        errorMessage(
          problem,
          "Could not create the category. Check for an identical name in this list, or retry.",
        ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/50 p-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="text-label">
          New category name
        </label>
        <Input
          id={id}
          value={name}
          maxLength={120}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void create();
            }
          }}
        />
      </div>
      <ErrorMessage error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !name.trim()} onClick={() => void create()}>
          {busy ? "Creating…" : "Create and select"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel category
        </Button>
      </div>
    </div>
  );
}
