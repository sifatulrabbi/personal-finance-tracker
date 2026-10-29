import { describe, expect, test } from "bun:test";
import type { Transaction, Wallet } from "@/api/types";
import {
  buildInput,
  cardPaymentDraft,
  changedFields,
  draftFieldFor,
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

describe("calculated amounts (ADR 0014)", () => {
  test("a calculation sends its rounded result and its canonical formula", () => {
    const built = buildInput(draft({ amount: "120+45.50+300×2" }), bdt);
    expect(built.ok && built.input).toMatchObject({ amount: "765.50", amount_formula: "120 + 45.50 + 300 * 2" });
  });

  test("a plain amount sends no formula", () => {
    const built = buildInput(draft({ amount: "765.50" }), bdt);
    expect(built.ok && "amount_formula" in built.input).toBe(false);
  });

  test("an invalid calculation is a field error, never sent", () => {
    const built = buildInput(draft({ amount: "120+" }), bdt);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.errors.amount).toContain("missing or extra");
  });

  test("a cross-currency received amount may be calculated", () => {
    const built = buildInput(
      draft({ kind: "transfer", to_wallet_id: "w2", amount: "1200", received_amount: "10 − 0.5", category_id: "" }),
      { from: "BDT", to: "USD" },
    );
    expect(built.ok && built.input).toMatchObject({ received_amount: "9.50", received_amount_formula: "10 - 0.5" });
  });

  test("a correction starts from the calculation, shown with people's operators", () => {
    const edited = draftFromRecord({ ...stored, amount: "765.50", amount_formula: "120 + 45.50 + 300 * 2" });
    expect(edited.amount).toBe("120 + 45.50 + 300 × 2");
    const built = buildInput(edited, bdt);
    expect(built.ok && built.input).toMatchObject({ amount: "765.50", amount_formula: "120 + 45.50 + 300 * 2" });
  });

  test("a server error on a formula belongs to its amount field", () => {
    expect(draftFieldFor("amount_formula")).toBe("amount");
    expect(draftFieldFor("received_amount_formula")).toBe("received_amount");
    expect(draftFieldFor("rate")).toBe("rate");
  });
});

describe("paying a credit card", () => {
  function wallet(overrides: Partial<Wallet>): Wallet {
    return {
      id: "w",
      name: "Wallet",
      type: "bank",
      card_type: "",
      currency: "BDT",
      details: "",
      credit_limit: "0.00",
      balance: "0.00",
      archived: false,
      version: 1,
      balance_version: 1,
      ...overrides,
    };
  }
  const card = wallet({ id: "card", type: "card", card_type: "credit", credit_limit: "50000.00", balance: "-12500.50", debt: "12500.50" });
  const otherCard = wallet({ id: "other-card", type: "card", card_type: "credit", debt: "0.00" });
  const bank = wallet({ id: "bank" });
  const cash = wallet({ id: "cash", type: "physical" });

  test("is a transfer into the card for what it owes, from the first wallet that holds cash", () => {
    expect(cardPaymentDraft(card, [card, otherCard, bank, cash], "2026-10-29")).toEqual({
      ...newDraft({ kind: "transfer", wallet_id: "bank", date: "2026-10-29" }),
      to_wallet_id: "card",
      amount: "12500.50",
    });
  });

  test("leaves the source empty when only cards are available", () => {
    expect(cardPaymentDraft(card, [card, otherCard], "2026-10-29").wallet_id).toBe("");
  });

  test("leaves the amount empty when nothing is owed", () => {
    for (const debt of ["0.00", "-20.00"])
      expect(cardPaymentDraft({ ...card, debt }, [bank], "2026-10-29").amount).toBe("");
  });

  test("puts what is owed in the received amount when the source has another currency", () => {
    const usd = wallet({ id: "usd", type: "digital", currency: "USD" });
    const paid = cardPaymentDraft(card, [usd, bank], "2026-10-29");
    expect(paid).toMatchObject({ wallet_id: "usd", amount: "", received_amount: "12500.50" });
  });
});
