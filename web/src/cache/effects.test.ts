import { describe, expect, test } from "bun:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { createFakeClient } from "@/api/fake";
import type { Bill, MonthlySpending, Transaction, TransactionFilters, TransactionPage, Wallet } from "@/api/types";
import { keys, pageSize } from "./keys";
import { matchesFilters, placeTransaction, type TransactionPages } from "./effects";
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

// Cursor pages as the server sends them: every page but the last names the next cursor.
function infinite(pages: Transaction[][], complete = true): TransactionPages {
  return {
    pages: pages.map((items, i) => ({
      items,
      next_cursor: i < pages.length - 1 || !complete ? `after-${items.at(-1)?.id}` : null,
    })),
    pageParams: pages.map((_, i) => (i === 0 ? null : `after-${pages[i - 1].at(-1)?.id}`)),
  };
}

const all = keys.transactionList({ include_voided: true });
const rowsOf = (data: TransactionPages | undefined) => uniqueRecords(data?.pages ?? []);

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
  client.setQueryData(all, infinite(pagesOf(60)));
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
    const rows = rowsOf(client.getQueryData<TransactionPages>(all));
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
    expect(rowsOf(client.getQueryData<TransactionPages>(all))[0].id).toBe(payment.id);
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
    expect(invalidated(client, all)).toBe(false);
  });

  test("a failed write leaves the cache untouched", async () => {
    const client = seeded();
    const before = client.getQueryData(all);
    const fake = createFakeClient({ createTransaction: async () => Promise.reject(new Error("nope")) });
    await expect(
      createWrites(fake.client, client).createTransaction(
        { kind: "expense", wallet_id: "w1", amount: "1", date: "2026-09-26", note: "" },
        { key: "k6" },
      ),
    ).rejects.toThrow("nope");
    expect(client.getQueryData<TransactionPages>(all)).toBe(before as TransactionPages);
    expect(invalidated(client, keys.wallets)).toBe(false);
  });
});

describe("placeTransaction with cursor pages", () => {
  test("a correction replaces the record where it is", () => {
    const pages = pagesOf(3);
    const corrected = { ...pages[0][1], amount: "99.00", version: 2 };
    const out = placeTransaction(infinite(pages), corrected)!;
    expect(out.pages[0].items.map((r) => r.id)).toEqual(pages[0].map((r) => r.id));
    expect(out.pages[0].items[1].amount).toBe("99.00");
  });

  test("a record older than everything loaded waits for its page while more exist", () => {
    const pages = pagesOf(pageSize);
    const old = record({ date: "2020-01-01" });
    const out = placeTransaction(infinite(pages, false), old)!;
    expect(rowsOf(out).some((r) => r.id === old.id)).toBe(false);
    // The cursor is untouched, so the next page still starts after the last loaded row.
    expect(out.pages.at(-1)!.next_cursor).toBe(`after-${pages[0].at(-1)!.id}`);
  });

  test("a record older than everything is appended when the list is complete", () => {
    const pages = pagesOf(3);
    const old = record({ date: "2020-01-01" });
    const out = placeTransaction(infinite(pages), old)!;
    expect(out.pages[0].items[3].id).toBe(old.id);
  });

  test("a date correction moves the record to its new position", () => {
    const pages = pagesOf(3);
    const moved = { ...pages[0][2], date: "2026-12-31", version: 2 };
    const out = placeTransaction(infinite(pages), moved)!;
    expect(out.pages[0].items[0].id).toBe(moved.id);
    expect(out.pages[0].items).toHaveLength(3);
  });

  test("a record lands in the loaded page where it sorts", () => {
    // Page one holds days 30 down to 14, page two starts on day 14 and ends on day 11.
    const pages = pagesOf(pageSize + 9);
    const dayTwelve = record({ date: "2026-08-12", created_at: "2026-09-20T00:00:00Z" });
    const out = placeTransaction(infinite(pages), dayTwelve)!;
    expect(out.pages[0].items).toHaveLength(pageSize);
    expect(out.pages[1].items.some((r) => r.id === dayTwelve.id)).toBe(true);
  });

  test("an equal revision time puts the newest write first", () => {
    const pages = pagesOf(3);
    const twin = record({ date: pages[0][0].date, created_at: pages[0][0].created_at });
    const out = placeTransaction(infinite(pages), twin)!;
    expect(out.pages[0].items[0].id).toBe(twin.id);
  });

  test("fraction digits of different widths compare as instants", () => {
    const rows = [
      record({ date: "2026-09-10", created_at: "2026-09-10T10:00:00.5Z" }),
      record({ date: "2026-09-10", created_at: "2026-09-10T10:00:00Z" }),
    ];
    // 10:00:00.25 is between the two, although as plain text "…00.25…Z" sorts after "…00Z".
    const between = record({ date: "2026-09-10", created_at: "2026-09-10T10:00:00.250000000Z" });
    const out = placeTransaction(infinite([rows]), between)!;
    expect(out.pages[0].items.map((r) => r.id)).toEqual([rows[0].id, between.id, rows[1].id]);
  });

  test("an empty list gets its first page", () => {
    const created = record();
    const out = placeTransaction({ pages: [], pageParams: [] }, created)!;
    expect(out.pages).toEqual([{ items: [created], next_cursor: null }]);
  });

  test("a record that no longer matches the list's filters leaves it", () => {
    const pages = pagesOf(3);
    const filters: TransactionFilters = { kind: "expense" };
    const recast = { ...pages[0][1], kind: "income" as const, version: 2 };
    const out = placeTransaction(infinite(pages), recast, filters)!;
    expect(rowsOf(out).map((r) => r.id)).toEqual([pages[0][0].id, pages[0][2].id]);
  });

  test("a voided record stays in a list that includes voided records, and leaves others", () => {
    const pages = pagesOf(3);
    const voided = { ...pages[0][0], voided: true, version: 2 };
    expect(rowsOf(placeTransaction(infinite(pages), voided, { include_voided: true }))[0].voided).toBe(true);
    expect(rowsOf(placeTransaction(infinite(pages), voided, {})).some((r) => r.id === voided.id)).toBe(false);
  });
});

describe("matchesFilters", () => {
  const base = record({ kind: "transfer", wallet_id: "w1", to_wallet_id: "w2", date: "2026-09-10" });
  test("a transfer matches both its wallets", () => {
    expect(matchesFilters(base, { wallet_id: "w1" })).toBe(true);
    expect(matchesFilters(base, { wallet_id: "w2" })).toBe(true);
    expect(matchesFilters(base, { wallet_id: "w3" })).toBe(false);
  });
  test("date bounds are inclusive", () => {
    expect(matchesFilters(base, { from: "2026-09-10", to: "2026-09-10" })).toBe(true);
    expect(matchesFilters(base, { from: "2026-09-11" })).toBe(false);
    expect(matchesFilters(base, { to: "2026-09-09" })).toBe(false);
  });
  test("kind and category must match", () => {
    expect(matchesFilters(base, { kind: "expense" })).toBe(false);
    expect(matchesFilters(record({ category_id: "c1" }), { category_id: "c1" })).toBe(true);
    expect(matchesFilters(record({ category_id: "c1" }), { category_id: "c2" })).toBe(false);
  });
});

describe("a write updates every cached list that should show it", () => {
  test("filtered lists get the record when it matches and not when it does not", async () => {
    const client = seeded();
    const expenses = keys.transactionList({ include_voided: true, kind: "expense" });
    const incomes = keys.transactionList({ include_voided: true, kind: "income" });
    client.setQueryData(expenses, infinite(pagesOf(3)));
    client.setQueryData(incomes, infinite([[]]));
    const created = record({ date: "2026-09-26", kind: "income" });
    const fake = createFakeClient({ createTransaction: async () => created });
    await createWrites(fake.client, client).createTransaction(
      { kind: "income", wallet_id: "w1", amount: "10.00", date: "2026-09-26", note: "" },
      { key: "k7" },
    );
    expect(rowsOf(client.getQueryData(incomes)).map((r) => r.id)).toEqual([created.id]);
    expect(rowsOf(client.getQueryData(expenses)).some((r) => r.id === created.id)).toBe(false);
    expect(rowsOf(client.getQueryData(all))[0].id).toBe(created.id);
  });

  test("a wallet's list is refetched, since debit card records join it by a server rule", async () => {
    const client = seeded();
    const walletList = keys.transactionList({ include_voided: true, wallet_id: "bank" });
    client.setQueryData(walletList, infinite(pagesOf(3)));
    const fake = createFakeClient({ createTransaction: async () => record({ wallet_id: "debit-card" }) });
    await createWrites(fake.client, client).createTransaction(
      { kind: "expense", wallet_id: "debit-card", amount: "1", date: "2026-09-26", note: "" },
      { key: "k8" },
    );
    expect(invalidated(client, walletList)).toBe(true);
  });

  test("a refreshed record replaces the stale copy and refetches its history", async () => {
    const client = seeded();
    const current = rowsOf(client.getQueryData(all))[5];
    const latest = { ...current, amount: "55.00", version: current.version + 1 };
    client.setQueryData(keys.history(current.id), [current]);
    const fake = createFakeClient({ transaction: async () => latest });
    await createWrites(fake.client, client).refreshTransaction(current.id);
    expect(rowsOf(client.getQueryData(all)).find((r) => r.id === current.id)!.amount).toBe("55.00");
    expect(invalidated(client, keys.history(current.id))).toBe(true);
  });
});

// Regression at the cache level for "Activity collapses to 50 rows after a save": a
// refetch of the infinite list refreshes every loaded page instead of dropping them.
test("refetching a cursor list keeps every loaded page", async () => {
  const rows = pagesOf(120).flat();
  const fake = createFakeClient({
    transactionPage: async ({ limit, cursor }) => {
      const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
      const items = rows.slice(start, start + limit);
      const more = start + limit < rows.length;
      return { items, next_cursor: more ? items[items.length - 1].id : null };
    },
  });
  const client = new QueryClient();
  const observer = new InfiniteQueryObserver(client, {
    queryKey: all,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      fake.client.transactionPage({ limit: pageSize, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: TransactionPage) => last.next_cursor ?? undefined,
  });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  await observer.fetchNextPage();
  expect(uniqueRecords(observer.getCurrentResult().data!.pages)).toHaveLength(100);
  await client.invalidateQueries({ queryKey: keys.transactionLists });
  expect(uniqueRecords(observer.getCurrentResult().data!.pages)).toHaveLength(100);
  // Someone else adds a record at the top: the refetch still shows two full pages, with the
  // new record first and no row repeated.
  const added = record({ date: "2026-12-01" });
  rows.unshift(added);
  await client.invalidateQueries({ queryKey: keys.transactionLists });
  const after = uniqueRecords(observer.getCurrentResult().data!.pages);
  expect(after).toHaveLength(100);
  expect(after[0].id).toBe(added.id);
  expect(observer.getCurrentResult().data!.pages.flatMap((p) => p.items)).toHaveLength(100);
  unsubscribe();
});
