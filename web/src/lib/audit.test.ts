import { expect, test } from "bun:test";
import type { AuditEvent, Wallet } from "@/api/types";
import { actorName, describeAudit } from "./audit";

const me = "sifat@example.test";
const bank: Wallet = {
  id: "w1",
  name: "City Bank",
  type: "bank",
  card_type: "",
  currency: "BDT",
  details: "",
  credit_limit: "0.00",
  balance: "0.00",
  archived: false,
  version: 1,
  balance_version: 1,
};
const context = { meEmail: me, wallets: [bank] };

function event(action: string, before: unknown, after: unknown, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 1,
    actor_email: me,
    entity_id: "e1",
    action,
    before,
    after,
    created_at: "2026-10-02T09:41:00Z",
    ...overrides,
  };
}

test("the signed-in user is You; others go by the name in their email", () => {
  expect(actorName("Sifat@Example.test", me)).toBe("You");
  expect(actorName("rumi@example.test", me)).toBe("rumi");
});

test("settings and target changes read as sentences with the values", () => {
  expect(describeAudit(event("rate", { rate: "122.50" }, { rate: "123.000000" }), context).sentence).toBe(
    "You changed the default exchange rate from 122.50 to 123.00 BDT per USD.",
  );
  expect(describeAudit(event("rate", { rate: "" }, { rate: "125" }), context).sentence).toBe(
    "You set the default exchange rate to 125.00 BDT per USD.",
  );
  const target = describeAudit(
    event(
      "monthly.target",
      { amount: "30000.00", version: 1, inherited_from: "2026-08" },
      { amount: "40000.00", version: 2 },
      { entity_id: "2026-09", actor_email: "rumi@example.test" },
    ),
    context,
  );
  expect(target.sentence).toBe("rumi set the September 2026 spending target to ৳40,000.00.");
  expect(target.details).toEqual(["Before: ৳30,000.00 (carried over from August 2026)"]);
});

test("wallet and schedule entries are told apart by their contents", () => {
  const wallet = { ...bank, name: "Cash" };
  expect(describeAudit(event("create", null, wallet), context).sentence).toBe(
    "You added the wallet “Cash”.",
  );
  expect(
    describeAudit(event("update", wallet, { ...wallet, archived: true }), context).sentence,
  ).toBe("You archived the wallet “Cash”.");
  const renamed = describeAudit(event("update", wallet, { ...wallet, name: "Pocket" }), context);
  expect(renamed).toEqual({
    sentence: "You edited the wallet “Pocket”.",
    details: ["Name: Cash → Pocket"],
  });
  const schedule = {
    id: "s1",
    name: "Rent",
    wallet_id: "w1",
    amount: "25000.00",
    start_date: "2026-09-05",
    frequency: "monthly",
    note: "",
    active: true,
    version: 1,
  };
  expect(describeAudit(event("create", null, schedule), context)).toEqual({
    sentence: "You added the recurring bill “Rent”.",
    details: ["Monthly, ৳25,000.00, first due 5 Sep 2026"],
  });
  const paused = describeAudit(
    event("update", schedule, { ...schedule, active: false, amount: "26000.00" }),
    context,
  );
  expect(paused.sentence).toBe("You paused the recurring bill “Rent”.");
  expect(paused.details).toEqual(["Expected amount: ৳25,000.00 → ৳26,000.00"]);
});

test("bill payments, skips, and reopenings name the bill and its due date", () => {
  const bill = { id: "b1", name: "Wi-Fi", due_date: "2026-09-01", wallet_id: "w1", amount: "1500.00" };
  expect(describeAudit(event("confirm", bill, { transaction_id: "t1" }), context).sentence).toBe(
    "You recorded the payment for “Wi-Fi” due 1 Sep 2026.",
  );
  expect(describeAudit(event("skip", bill, { bill, reason: "Away" }), context)).toEqual({
    sentence: "You skipped “Wi-Fi” due 1 Sep 2026.",
    details: ["Reason: Away"],
  });
  expect(describeAudit(event("reopen", {}, { status: "due" }), context).sentence).toBe(
    "You voided a bill payment, so that bill is due again.",
  );
});

test("an entry the client does not know yet is still a sentence, never raw JSON", () => {
  expect(describeAudit(event("something.new", null, null), context)).toEqual({
    sentence: "You made a change (something.new).",
    details: [],
  });
});
