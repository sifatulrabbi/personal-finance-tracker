import { describe, expect, test } from "bun:test";
import type { Transaction } from "@/api/types";
import {
  buildInput,
  changedFields,
  draftFromRecord,
  isCrossCurrency,
  newDraft,
  reapplyEdits,
  showsRate,
  type RecordDraft,
} from "./draft";

const bdt = { from: "BDT", to: undefined } as const;

function draft(overrides: Partial<RecordDraft> = {}): RecordDraft {
  return { ...newDraft({ wallet_id: "w1", date: "2026-09-26" }), amount: "125.50", ...overrides };
}

const stored: Transaction = {
  id: "t1",
  kind: "expense",
  category_id: "expense-groceries",
  wallet_id: "w1",
  amount: "200.00",
  date: "2026-09-20",
  note: "Market",
  reason: "Earlier reason",
  version: 3,
  voided: false,
  bdt_amount: "200.00",
  actor_email: "a@example.test",
  created_at: "2026-09-20T10:00:00Z",
};

describe("a new draft", () => {
  test("starts as an expense in Others, on the given wallet and date", () => {
    expect(newDraft({ wallet_id: "w1", date: "2026-09-26" })).toMatchObject({
      kind: "expense",
      category_id: "others-expense",
      wallet_id: "w1",
      date: "2026-09-26",
      amount: "",
    });
  });
});

describe("buildInput", () => {
  test("an expense sends its category and never a destination", () => {
    const built = buildInput(draft({ category_id: "expense-groceries", to_wallet_id: "w2" }), bdt);
    expect(built).toEqual({
      ok: true,
      input: { kind: "expense", wallet_id: "w1", amount: "125.50", date: "2026-09-26", note: "", category_id: "expense-groceries" },
    });
  });

  test("a transfer sends its destination and never a category", () => {
    const built = buildInput(draft({ kind: "transfer", to_wallet_id: "w2", category_id: "others-expense" }), {
      from: "BDT",
      to: "BDT",
    });
    expect(built.ok && built.input).toEqual({
      kind: "transfer",
      wallet_id: "w1",
      to_wallet_id: "w2",
      amount: "125.50",
      date: "2026-09-26",
      note: "",
    });
  });

  test("grouped digits are accepted and normalized", () => {
    const built = buildInput(draft({ amount: "1,020.5" }), bdt);
    expect(built.ok && built.input.amount).toBe("1020.5");
  });

  test("an empty or malformed amount is an error at the amount", () => {
    expect(buildInput(draft({ amount: "" }), bdt)).toEqual({ ok: false, errors: { amount: "Enter the amount." } });
    const built = buildInput(draft({ amount: "12,50" }), bdt);
    expect(!built.ok && built.errors.amount).toContain("Use a dot for decimals");
  });

  // An explicit invalid value is an error, not an omission (CLAUDE.md).
  test("a malformed optional rate is an error, never sent as empty", () => {
    const built = buildInput(draft({ rate: "abc" }), { from: "USD" });
    expect(!built.ok && built.errors.rate).toBeTruthy();
  });

  test("an empty rate is left out so the server applies its default", () => {
    const built = buildInput(draft({ rate: "" }), { from: "USD" });
    expect(built.ok && "rate" in built.input).toBe(false);
  });

  test("a rate and received amount are sent only where they apply", () => {
    const sameCurrency = buildInput(draft({ rate: "125", received_amount: "9" }), bdt);
    expect(sameCurrency.ok && sameCurrency.input.rate).toBeUndefined();
    expect(sameCurrency.ok && sameCurrency.input.received_amount).toBeUndefined();
    const cross = buildInput(
      draft({ kind: "transfer", to_wallet_id: "w2", amount: "10", received_amount: "1,250", rate: "125.123456" }),
      { from: "USD", to: "BDT" },
    );
    expect(cross.ok && cross.input).toMatchObject({ received_amount: "1250", rate: "125.123456" });
  });

  test("missing wallets and dates are named at their fields", () => {
    const built = buildInput(draft({ kind: "transfer", wallet_id: "", to_wallet_id: "", date: "" }), {});
    expect(!built.ok && Object.keys(built.errors).sort()).toEqual(["date", "to_wallet_id", "wallet_id"]);
  });

  test("a reason is sent only when written", () => {
    const blank = buildInput(draft({ reason: "  " }), bdt);
    expect(blank.ok && "reason" in blank.input).toBe(false);
    const built = buildInput(draft({ reason: "Typo" }), bdt);
    expect(built.ok && built.input.reason).toBe("Typo");
  });
});

describe("rate and received amount visibility", () => {
  test("a rate applies to USD income and expenses and to cross-currency transfers", () => {
    expect(showsRate("expense", { from: "USD" })).toBe(true);
    expect(showsRate("income", { from: "BDT" })).toBe(false);
    expect(showsRate("transfer", { from: "USD", to: "USD" })).toBe(false);
    expect(showsRate("transfer", { from: "BDT", to: "USD" })).toBe(true);
  });
  test("a received amount applies only when a transfer changes currency", () => {
    expect(isCrossCurrency("transfer", { from: "USD", to: "BDT" })).toBe(true);
    expect(isCrossCurrency("transfer", { from: "BDT", to: "BDT" })).toBe(false);
    expect(isCrossCurrency("expense", { from: "USD", to: "BDT" })).toBe(false);
  });
});

describe("reapplying edits after someone else saved a newer version", () => {
  test("the user's changed fields win, everything else takes the newer version", () => {
    const base = draftFromRecord(stored);
    const edited = { ...base, amount: "180", reason: "Receipt says 180" };
    const latest = draftFromRecord({ ...stored, note: "Market, with Rumana", date: "2026-09-21", version: 4 });
    expect(reapplyEdits(base, edited, latest)).toEqual({
      ...latest,
      amount: "180",
      reason: "Receipt says 180",
    });
  });

  test("a field both people changed keeps the user's value", () => {
    const base = draftFromRecord(stored);
    const edited = { ...base, note: "Mine" };
    const latest = draftFromRecord({ ...stored, note: "Theirs" });
    expect(reapplyEdits(base, edited, latest).note).toBe("Mine");
  });

  test("changed fields are listed for the review note", () => {
    const base = draftFromRecord(stored);
    expect(changedFields(base, { ...base, amount: "1", note: "x" })).toEqual(["amount", "note"]);
  });

  test("a correction starts from the record, with a fresh reason", () => {
    expect(draftFromRecord(stored)).toMatchObject({ amount: "200.00", category_id: "expense-groceries", reason: "" });
  });
});
