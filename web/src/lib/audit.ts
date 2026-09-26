import type { AuditEvent, Currency, Wallet } from "@/api/types";
import { moneyLabel } from "@/money/format";
import { fullDate, monthLabel } from "./dates";

// Turns a change-log entry into a sentence people can read ("You archived the wallet
// “Cash”.") plus a short list of what changed. The server's before and after values are
// shown as they were stored; nothing is recomputed. Unknown entries still read as a
// sentence instead of raw JSON.

export type AuditContext = {
  // The signed-in user, shown as "You".
  meEmail: string;
  // For wallet names and currencies in bill and schedule entries.
  wallets: Wallet[];
};

export type AuditDescription = { sentence: string; details: string[] };

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

const quote = (name: unknown) => `“${text(name)}”`;

// The household member who made a change: "You" for the signed-in user, otherwise the
// name part of their email address.
export function actorName(email: string, meEmail: string) {
  if (email.toLowerCase() === meEmail.toLowerCase()) return "You";
  return email.split("@")[0] || email;
}

function isSchedule(value: Json) {
  return "frequency" in value;
}

function walletCurrency(context: AuditContext, walletID: unknown): Currency {
  return context.wallets.find((wallet) => wallet.id === walletID)?.currency ?? "BDT";
}

function walletName(context: AuditContext, walletID: unknown) {
  return context.wallets.find((wallet) => wallet.id === walletID)?.name ?? "another wallet";
}

function change(label: string, before: string, after: string) {
  return `${label}: ${before || "none"} → ${after || "none"}`;
}

function walletChanges(before: Json, after: Json) {
  const details: string[] = [];
  const currency = text(after.currency) || "BDT";
  if (text(before.name) !== text(after.name))
    details.push(change("Name", text(before.name), text(after.name)));
  if (text(before.details) !== text(after.details)) details.push("Account details changed");
  if (after.card_type === "credit" && text(before.credit_limit) !== text(after.credit_limit))
    details.push(
      change(
        "Credit limit",
        moneyLabel(text(before.credit_limit) || "0", currency),
        moneyLabel(text(after.credit_limit) || "0", currency),
      ),
    );
  return details;
}

function scheduleChanges(before: Json, after: Json, context: AuditContext) {
  const details: string[] = [];
  if (text(before.name) !== text(after.name))
    details.push(change("Name", text(before.name), text(after.name)));
  if (text(before.amount) !== text(after.amount) || before.wallet_id !== after.wallet_id)
    details.push(
      change(
        "Expected amount",
        moneyLabel(text(before.amount) || "0", walletCurrency(context, before.wallet_id)),
        moneyLabel(text(after.amount) || "0", walletCurrency(context, after.wallet_id)),
      ),
    );
  if (before.wallet_id !== after.wallet_id)
    details.push(
      change("Wallet", walletName(context, before.wallet_id), walletName(context, after.wallet_id)),
    );
  if (text(before.end_date) !== text(after.end_date))
    details.push(
      change("Last due date", fullDate(text(before.end_date)), fullDate(text(after.end_date))),
    );
  if (text(before.note) !== text(after.note)) details.push("Note changed");
  if (text(before.category_id) !== text(after.category_id)) details.push("Category changed");
  return details;
}

function targetText(target: Json) {
  const amount = text(target.amount);
  return amount ? moneyLabel(amount, "BDT") : "";
}

export function describeAudit(event: AuditEvent, context: AuditContext): AuditDescription {
  const who = actorName(event.actor_email, context.meEmail);
  const before = object(event.before);
  const after = object(event.after);
  switch (event.action) {
    case "category.create":
      return {
        sentence: `${who} added the ${after.type === "income" ? "income" : "expense"} category ${quote(after.name)}.`,
        details: [],
      };
    case "monthly.target": {
      const month = monthLabel(event.entity_id);
      const previous = targetText(before);
      const next = targetText(after);
      const details = previous
        ? [
            `Before: ${previous}${before.inherited_from ? ` (carried over from ${monthLabel(text(before.inherited_from))})` : ""}`,
          ]
        : [];
      return {
        sentence: next
          ? `${who} set the ${month} spending target to ${next}.`
          : `${who} cleared the ${month} spending target.`,
        details,
      };
    }
    case "rate": {
      const previous = text(before.rate);
      const next = text(after.rate);
      return {
        sentence: previous
          ? `${who} changed the default exchange rate from ${previous} to ${next} BDT per USD.`
          : `${who} set the default exchange rate to ${next} BDT per USD.`,
        details: [],
      };
    }
    case "create":
      if (isSchedule(after))
        return {
          sentence: `${who} added the recurring bill ${quote(after.name)}.`,
          details: [
            `${capitalize(text(after.frequency))}, ${moneyLabel(text(after.amount) || "0", walletCurrency(context, after.wallet_id))}, first due ${fullDate(text(after.start_date))}`,
          ],
        };
      return { sentence: `${who} added the wallet ${quote(after.name)}.`, details: [] };
    case "update":
      if (isSchedule(after)) {
        const details = scheduleChanges(before, after, context);
        if (before.active !== after.active)
          return {
            sentence: after.active
              ? `${who} resumed the recurring bill ${quote(after.name)}.`
              : `${who} paused the recurring bill ${quote(after.name)}.`,
            details,
          };
        return { sentence: `${who} edited the recurring bill ${quote(after.name)}.`, details };
      } else {
        const details = walletChanges(before, after);
        if (before.archived !== after.archived)
          return {
            sentence: after.archived
              ? `${who} archived the wallet ${quote(after.name)}.`
              : `${who} restored the wallet ${quote(after.name)}.`,
            details,
          };
        return { sentence: `${who} edited the wallet ${quote(after.name)}.`, details };
      }
    case "confirm":
      return {
        sentence: `${who} recorded the payment for ${quote(before.name)} due ${fullDate(text(before.due_date))}.`,
        details: [],
      };
    case "skip": {
      const reason = text(after.reason);
      return {
        sentence: `${who} skipped ${quote(before.name)} due ${fullDate(text(before.due_date))}.`,
        details: reason ? [`Reason: ${reason}`] : [],
      };
    }
    case "reopen":
      return {
        sentence: `${who} voided a bill payment, so that bill is due again.`,
        details: [],
      };
    default:
      return { sentence: `${who} made a change (${event.action}).`, details: [] };
  }
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
