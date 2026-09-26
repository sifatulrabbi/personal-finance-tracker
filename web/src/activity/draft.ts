import type { Currency, Transaction, TransactionInput } from "@/api/types";
import { parseDecimalInput } from "@/money/decimal";
import { displayFormula, evaluateAmountInput } from "@/money/formula";

// The Add/Correct record form as plain data. The form edits a draft; this module turns it
// into a request body with format checks only (is the amount a well-formed decimal?). Every
// rule about what may be recorded stays on the server, and its field errors are shown next
// to the matching field.

export type RecordKind = "expense" | "income" | "transfer";

export type RecordDraft = {
  kind: RecordKind;
  amount: string;
  wallet_id: string;
  to_wallet_id: string;
  category_id: string;
  date: string;
  note: string;
  received_amount: string;
  rate: string;
  reason: string;
};

// Named like the JSON fields, so a server error's `field` points straight at one of these.
export type DraftField = Exclude<keyof RecordDraft, "kind">;
export const draftFields: DraftField[] = [
  "amount",
  "wallet_id",
  "to_wallet_id",
  "category_id",
  "date",
  "note",
  "received_amount",
  "rate",
  "reason",
];

export type FieldErrors = Partial<Record<DraftField, string>>;

export function isDraftField(name: string | undefined): name is DraftField {
  return draftFields.includes(name as DraftField);
}

// The draft field a server error belongs to: a formula error is shown at its amount.
export function draftFieldFor(name: string | undefined): string | undefined {
  return name?.replace(/_formula$/, "");
}

export function othersCategory(kind: RecordKind) {
  return kind === "transfer" ? "" : `others-${kind}`;
}

export function newDraft(values: { kind?: RecordKind; wallet_id?: string; date: string }): RecordDraft {
  const kind = values.kind ?? "expense";
  return {
    kind,
    amount: "",
    wallet_id: values.wallet_id ?? "",
    to_wallet_id: "",
    category_id: othersCategory(kind),
    date: values.date,
    note: "",
    received_amount: "",
    rate: "",
    reason: "",
  };
}

// The form's starting point for a correction: the record as it is now. The reason is new
// for each correction, so it starts empty. An amount that was calculated shows its
// calculation, so it can be corrected where it went wrong.
export function draftFromRecord(record: Transaction): RecordDraft {
  return {
    kind: record.kind as RecordKind,
    amount: record.amount_formula ? displayFormula(record.amount_formula) : record.amount,
    wallet_id: record.wallet_id,
    to_wallet_id: record.to_wallet_id ?? "",
    category_id: record.category_id ?? "",
    date: record.date,
    note: record.note,
    received_amount: record.received_amount_formula
      ? displayFormula(record.received_amount_formula)
      : (record.received_amount ?? ""),
    rate: record.rate ?? "",
    reason: "",
  };
}

// After a 409: someone else saved a newer version. Every field the user changed from the
// version they started with keeps their value; every other field takes the newer value.
// The result is shown for review; it is never saved automatically.
export function reapplyEdits(base: RecordDraft, edited: RecordDraft, latest: RecordDraft): RecordDraft {
  const out = { ...latest, kind: base.kind };
  for (const field of draftFields) if (edited[field] !== base[field]) out[field] = edited[field];
  return out;
}

// The fields a user changed, for the "your edits were kept" note.
export function changedFields(base: RecordDraft, edited: RecordDraft): DraftField[] {
  return draftFields.filter((field) => edited[field] !== base[field]);
}

export type Currencies = { from?: Currency; to?: Currency };

// A received amount matters only when a transfer changes currency.
export function isCrossCurrency(kind: RecordKind, currencies: Currencies) {
  return kind === "transfer" && Boolean(currencies.from && currencies.to) && currencies.from !== currencies.to;
}

// Where a rate can apply: a USD income or expense, or a transfer between currencies. The
// field is optional; the server uses the default rate and answers rate_required when none
// is set.
export function showsRate(kind: RecordKind, currencies: Currencies) {
  if (kind === "transfer") return isCrossCurrency(kind, currencies);
  return currencies.from === "USD";
}

type Built = { ok: true; input: TransactionInput } | { ok: false; errors: FieldErrors };

// An amount, typed as a number or a calculation.
function amount(
  value: string,
  label: string,
  { required }: { required: boolean },
): { value: string; formula?: string } | { error: string } {
  const result = evaluateAmountInput(value);
  if (result.kind === "invalid") return { error: result.message };
  if (result.kind === "empty") return required ? { error: `Enter the ${label}.` } : { value: "" };
  return result.formula ? { value: result.value, formula: result.formula } : { value: result.value };
}

function decimal(
  value: string,
  label: string,
  { required, maxFraction }: { required: boolean; maxFraction: number },
): { value: string } | { error: string } {
  const result = parseDecimalInput(value, { maxFraction });
  if (result.kind === "invalid") return { error: result.message };
  if (result.kind === "empty") return required ? { error: `Enter the ${label}.` } : { value: "" };
  return { value: result.value };
}

// Turns a draft into the request body, or explains which fields cannot be sent as typed.
// An invalid optional number is an error, never silently sent as empty.
export function buildInput(draft: RecordDraft, currencies: Currencies): Built {
  const errors: FieldErrors = {};
  const sent = amount(draft.amount, "amount", { required: true });
  if ("error" in sent) errors.amount = sent.error;
  if (!draft.wallet_id)
    errors.wallet_id = draft.kind === "transfer" ? "Choose the wallet the money left." : "Choose a wallet.";
  const transfer = draft.kind === "transfer";
  if (transfer && !draft.to_wallet_id) errors.to_wallet_id = "Choose the wallet that received it.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = "Choose a date.";
  const cross = isCrossCurrency(draft.kind, currencies);
  const received = cross
    ? amount(draft.received_amount, "received amount", { required: false })
    : { value: "" };
  if ("error" in received) errors.received_amount = received.error;
  const rate = showsRate(draft.kind, currencies)
    ? decimal(draft.rate, "rate", { required: false, maxFraction: 6 })
    : { value: "" };
  if ("error" in rate) errors.rate = rate.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  const input: TransactionInput = {
    kind: draft.kind,
    wallet_id: draft.wallet_id,
    amount: (sent as { value: string }).value,
    date: draft.date,
    note: draft.note,
  };
  if (transfer) input.to_wallet_id = draft.to_wallet_id;
  else if (draft.category_id) input.category_id = draft.category_id;
  const receivedValue = received as { value: string; formula?: string };
  const rateValue = (rate as { value: string }).value;
  const sentFormula = (sent as { formula?: string }).formula;
  if (sentFormula) input.amount_formula = sentFormula;
  if (receivedValue.value) input.received_amount = receivedValue.value;
  if (receivedValue.formula) input.received_amount_formula = receivedValue.formula;
  if (rateValue) input.rate = rateValue;
  if (draft.reason.trim()) input.reason = draft.reason;
  return { ok: true, input };
}
