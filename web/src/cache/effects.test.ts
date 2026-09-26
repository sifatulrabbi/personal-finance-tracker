import { describe, expect, test } from "bun:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { createFakeClient } from "@/api/fake";
import type { Bill, MonthlySpending, Transaction, Wallet } from "@/api/types";
import { keys, pageSize } from "./keys";
import { nextOffset, placeTransaction, type TransactionPages } from "./effects";
import { createWrites } from "./writes";
import { uniqueRecords } from "./queries";

let sequence = 0;
function record(overrides: Partial<Transaction> = {}): Transaction {
  sequence++;
  return {
    id: `t${String(sequence).padStart(4, "0")}`,
    kind: "expense",
    wallet_id: "w1",
    amount: "10.00",
    date: "2026-09-10",
    note: "",
    reason: "",
    version: 1,
    voided: false,
    bdt_amount: "10.00",
    actor_email: "a@example.test",
    created_at: `2026-09-10T00:00:${String(sequence % 60).padStart(2, "0")}Z`,
    ...overrides,
  };
}

// Records sorted as the server lists them: newest date first.
function pagesOf(count: number, firstDate = 30): Transaction[][] {
  // Three records per day, newest created first within the day, as the server orders them.
  // Past day 1 the date stays at the 1st and the creation time keeps falling.
  const rows = Array.from({ length: count }, (_, i) => {
    const day = Math.max(1, firstDate - Math.floor(i / 3));
    return record({
      date: `2026-08-${String(day).padStart(2, "0")}`,
      created_at: new Date(Date.UTC(2026, 8, 1) - i * 1000).toISOString(),
    });
  });
  const pages: Transaction[][] = [];
  for (let i = 0; i < rows.length; i += pageSize) pages.push(rows.slice(i, i + pageSize));
  return pages;
}

function infinite(pages: Transaction[][]): TransactionPages {
  return { pages, pageParams: pages.map((_, i) => i * pageSize) };
}

const wallet: Wallet = {
  id: "w1",
  name: "Cash",
  type: "physical",
  card_type: "",
  currency: "BDT",
  details: "",
  credit_limit: "0.00",
  balance: "100.00",
  archived: false,
  version: 1,
  balance_version: 1,
};

function seeded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(keys.wallets, [wallet]);
  client.setQueryData(keys.transactions, infinite(pagesOf(60)));
  client.setQueryData(keys.categories, [{ id: "others-expense", name: "Others", type: "expense" }]);
  client.setQueryData(keys.settings, { rate: "125", version: 1, timezone: "Asia/Dhaka", default_currency: "BDT" });
  client.setQueryData(keys.schedules, []);
  client.setQueryData<Bill[]>(keys.dueBills, [
    { id: "b1", schedule_id: "s1", category_id: "others-expense", due_date: "2026-09-01", wallet_id: "w1", amount: "5.00", name: "Wi-Fi", note: "", status: "due" },
  ]);
  const monthly: MonthlySpending = { month: "2026-09", spent: "0.00", target: { amount: "", version: 0 }, categories: [] };
  client.setQueryData(keys.monthly("2026-09"), monthly);
  return client;
}

const invalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated ?? false;

describe("writes update the cache from the server's record", () => {
  // Regression: every save used to refetch six endpoints and reset Activity to 50 rows.
  test("a new record keeps loaded pages and touches only affected queries", async () => {
    const client = seeded();
    const created = record({ date: "2026-09-26", note: "Groceries" });
    const fake = createFakeClient({ createTransaction: async () => created });
    await createWrites(fake.client, client).createTransaction(
      { kind: "expense", wallet_id: "w1", amount: "10.00", date: "2026-09-26", note: "Groceries" },
      { key: "k1" },
    );
    const data = client.getQueryData<TransactionPages>(keys.transactions)!;
    const rows = uniqueRecords(data.pages);
    expect(rows).toHaveLength(61);
    expect(rows[0].id).toBe(created.id);
    expect(fake.calls.map((c) => c.method)).toEqual(["createTransaction"]);
    expect(invalidated(client, keys.wallets)).toBe(true);
    expect(invalidated(client, keys.monthly("2026-09"))).toBe(true);
    for (const untouched of [keys.categories, keys.settings, keys.schedules, keys.dueBills])
      expect(invalidated(client, untouched)).toBe(false);
  });

  test("a confirmed bill leaves the due list and its expense appears at once", async () => {
    const client = seeded();
    const payment = record({ date: "2026-09-26", note: "Wi-Fi" });
    const fake = createFakeClient({ confirmBill: async () => payment });
    await createWrites(fake.client, client).confirmBill(
      "b1",
      { amount: "", wallet_id: "w1", date: "2026-09-26", rate: "", note: "" },
      { key: "k2" },
    );
    expect(client.getQueryData<Bill[]>(keys.dueBills)).toEqual([]);
    expect(client.getQueryData<TransactionPages>(keys.transactions)!.pages[0][0].id).toBe(payment.id);
    expect(invalidated(client, keys.settings)).toBe(false);
  });

  test("a target save updates that month in place without a refetch", async () => {
    const client = seeded();
    const fake = createFakeClient({ setMonthlyTarget: async () => ({ amount: "4000.00", version: 1 }) });
    await createWrites(fake.client, client).setMonthlyTarget("2026-09", { amount: "4000", version: 0 }, { key: "k3" });
    expect(client.getQueryData<MonthlySpending>(keys.monthly("2026-09"))!.target).toEqual({ amount: "4000.00", version: 1 });
    expect(invalidated(client, keys.monthly("2026-09"))).toBe(false);
  });

  // Regression: a month without its own target carries the latest earlier one over
  // (ADR 0010), so saving August must refresh a loaded September that inherits it.
  test("a target save refreshes other loaded months and the Home summary", async () => {
    const client = seeded();
    const later: MonthlySpending = {
      month: "2026-10",
      spent: "0.00",
      target: { amount: "3000.00", version: 1, inherited_from: "2026-09" },
      categories: [],
    };
    client.setQueryData(keys.monthly("2026-10"), later);
    client.setQueryData(keys.summary, { today: "2026-10-02" });
    const fake = createFakeClient({ setMonthlyTarget: async () => ({ amount: "4000.00", version: 2 }) });
    await createWrites(fake.client, client).setMonthlyTarget("2026-09", { amount: "4000", version: 1 }, { key: "k7" });
    expect(invalidated(client, keys.monthly("2026-09"))).toBe(false);
    expect(invalidated(client, keys.monthly("2026-10"))).toBe(true);
    expect(invalidated(client, keys.summary)).toBe(true);
  });

  test("records, payments, and skips refresh the Home summary and bill history", async () => {
    const client = seeded();
    client.setQueryData(keys.summary, { today: "2026-09-26" });
    client.setQueryData(keys.billHistory("paid"), { pages: [[]], pageParams: [0] });
    client.setQueryData(keys.billHistory("skipped"), { pages: [[]], pageParams: [0] });
    const payment = record({ date: "2026-09-26" });
    const fake = createFakeClient({
      confirmBill: async () => payment,
      skipBill: async () => ({ id: "b1" }) as Bill,
    });
    const writes = createWrites(fake.client, client);
    await writes.confirmBill("b1", { amount: "", wallet_id: "w1", date: "2026-09-26", rate: "", note: "" }, { key: "k8" });
    expect(invalidated(client, keys.summary)).toBe(true);
    expect(invalidated(client, keys.billHistory("paid"))).toBe(true);
    expect(invalidated(client, keys.billHistory("skipped"))).toBe(false);
    await writes.skipBill("b1", { reason: "Away" }, { key: "k9" });
    expect(invalidated(client, keys.billHistory("skipped"))).toBe(true);
  });

  test("a wallet edit also updates that wallet's own detail read", async () => {
    const client = seeded();
    client.setQueryData(keys.wallet("w1"), wallet);
    const archived = { ...wallet, archived: true, version: 2 };
    const fake = createFakeClient({ updateWallet: async () => archived });
    await createWrites(fake.client, client).updateWallet(
      { id: "w1", name: "Cash", type: "physical", card_type: "", currency: "BDT", details: "", credit_limit: "0.00", archived: true, version: 1 },
      { key: "k10" },
    );
    expect(client.getQueryData<Wallet>(keys.wallet("w1"))).toEqual(archived);
  });

  test("a new category is appended without touching wallets or records", async () => {
    const client = seeded();
    const fake = createFakeClient({ createCategory: async () => ({ id: "c9", name: "Pets", type: "income" }) });
    await createWrites(fake.client, client).createCategory({ name: "Pets", type: "income" }, { key: "k4" });
    expect(client.getQueryData<unknown[]>(keys.categories)).toHaveLength(2);
    expect(invalidated(client, keys.wallets)).toBe(false);
    expect(invalidated(client, keys.monthly("2026-09"))).toBe(false);
  });

  test("a wallet edit replaces that wallet only", async () => {
    const client = seeded();
    const renamed = { ...wallet, name: "Pocket", version: 2 };
    const fake = createFakeClient({ updateWallet: async () => renamed });
    await createWrites(fake.client, client).updateWallet(
      { id: "w1", name: "Pocket", type: "physical", card_type: "", currency: "BDT", details: "", credit_limit: "0.00", archived: false, version: 1 },
      { key: "k5" },
    );
    expect(client.getQueryData<Wallet[]>(keys.wallets)).toEqual([renamed]);
    expect(invalidated(client, keys.transactions)).toBe(false);
  });

  test("a failed write leaves the cache untouched", async () => {
    const client = seeded();
    const before = client.getQueryData(keys.transactions);
    const fake = createFakeClient({ createTransaction: async () => Promise.reject(new Error("nope")) });
    await expect(
      createWrites(fake.client, client).createTransaction(
        { kind: "expense", wallet_id: "w1", amount: "1", date: "2026-09-26", note: "" },
        { key: "k6" },
      ),
    ).rejects.toThrow("nope");
    expect(client.getQueryData<TransactionPages>(keys.transactions)).toBe(
      before as TransactionPages,
    );
    expect(invalidated(client, keys.wallets)).toBe(false);
  });
});

describe("placeTransaction", () => {
  test("a correction replaces the record where it is", () => {
    const pages = pagesOf(3);
    const corrected = { ...pages[0][1], amount: "99.00", version: 2 };
    const out = placeTransaction(infinite(pages), corrected)!;
    expect(out.pages[0].map((r) => r.id)).toEqual(pages[0].map((r) => r.id));
    expect(out.pages[0][1].amount).toBe("99.00");
  });

  test("a record older than everything loaded waits for its page while more exist", () => {
    const pages = pagesOf(pageSize);
    const old = record({ date: "2020-01-01" });
    const out = placeTransaction(infinite(pages), old)!;
    expect(uniqueRecords(out.pages).some((r) => r.id === old.id)).toBe(false);
  });

  test("a record older than everything is appended when the list is complete", () => {
    const pages = pagesOf(3);
    const old = record({ date: "2020-01-01" });
    const out = placeTransaction(infinite(pages), old)!;
    expect(out.pages[0][3].id).toBe(old.id);
  });

  test("a date correction moves the record to its new position", () => {
    const pages = pagesOf(3);
    const moved = { ...pages[0][2], date: "2026-12-31", version: 2 };
    const out = placeTransaction(infinite(pages), moved)!;
    expect(out.pages[0][0].id).toBe(moved.id);
    expect(out.pages[0]).toHaveLength(3);
  });

  test("the next offset is the loaded count", () => {
    expect(nextOffset(pagesOf(pageSize + 10))).toBeUndefined();
    const full = [pagesOf(pageSize)[0], pagesOf(pageSize)[0]];
    expect(nextOffset(full)).toBe(pageSize * 2);
  });
});

// Regression at the cache level for "Activity collapses to 50 rows after a save": a
// refetch of the infinite list refreshes every loaded page instead of dropping them.
test("refetching the record list keeps every loaded page", async () => {
  const all = pagesOf(120).flat();
  const fake = createFakeClient({
    transactions: async ({ limit, offset }) => all.slice(offset, offset + limit),
  });
  const client = new QueryClient();
  const observer = new InfiniteQueryObserver(client, {
    queryKey: keys.transactions,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fake.client.transactions({ limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (_: Transaction[], pages: Transaction[][]) => nextOffset(pages),
  });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  await observer.fetchNextPage();
  expect(uniqueRecords(observer.getCurrentResult().data!.pages)).toHaveLength(100);
  await client.invalidateQueries({ queryKey: keys.transactions });
  expect(uniqueRecords(observer.getCurrentResult().data!.pages)).toHaveLength(100);
  unsubscribe();
});
