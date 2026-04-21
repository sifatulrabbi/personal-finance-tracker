import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import type { BunSqlDatabase } from "@/libs/server/db/client";
import { createRepositories } from "@/libs/server/db/repository";
import {
  SEED_HOUSEHOLDS,
  createIntegrationTestDb,
  migrateAndSeed,
  resetPublicSchema,
} from "@/test/helpers/database";

let db: BunSqlDatabase;

beforeAll(async () => {
  db = createIntegrationTestDb();
});

beforeEach(async () => {
  await resetPublicSchema(db);
  await migrateAndSeed(db);
});

afterAll(async () => {
  await db.close();
});

/**
 * Fixture builder: seeds a full ledger context (account, category, origin)
 * inside the "real" household so transaction tests can focus on behaviour
 * rather than setup. Returns the repository bundle for convenience.
 */
async function bootstrapLedger() {
  const repos = createRepositories({ db });
  const householdId = SEED_HOUSEHOLDS.real.id;
  const userId = SEED_HOUSEHOLDS.real.seedUser.id;
  const personId = SEED_HOUSEHOLDS.real.defaultPerson.id;

  const account = await repos.accounts.insert({
    householdId,
    name: "Main Wallet",
    description: null,
    initialBalanceMinor: 100_000,
  });
  const destinationAccount = await repos.accounts.insert({
    householdId,
    name: "Savings",
    description: null,
    initialBalanceMinor: 50_000,
  });
  const category = await repos.categories.insert({
    householdId,
    name: "Groceries",
    description: null,
  });
  const origin = await repos.origins.insert({
    householdId,
    name: "Acme Corp",
    description: null,
  });

  return {
    repos,
    householdId,
    userId,
    personId,
    account,
    destinationAccount,
    category,
    origin,
  };
}

describe("transactions-repository", () => {
  test("insertExpense debits the account and embeds joined names", async () => {
    const { repos, householdId, userId, personId, account, category } =
      await bootstrapLedger();

    const tx = await repos.transactions.insertExpense({
      householdId,
      accountId: account.id,
      personId,
      categoryId: category.id,
      createdByUserId: userId,
      amountMinor: 3_250,
      originalCurrencyCode: "BDT",
      originalAmountMinor: 3_250,
      exchangeRateToBdtMinor: 100,
      description: "Weekly groceries",
      transactionDate: "2026-04-07",
    });

    expect(tx.type).toBe("expense");
    expect(tx.amountMinor).toBe(3_250);
    expect(tx.account).toEqual({ id: account.id, name: "Main Wallet" });
    expect(tx.category).toEqual({ id: category.id, name: "Groceries" });
    expect(tx.origin).toBeNull();

    const after = await repos.accounts.findById({
      householdId,
      id: account.id,
    });
    expect(after?.currentBalanceMinor).toBe(100_000 - 3_250);
  });

  test("insertIncome credits the account and requires an origin", async () => {
    const { repos, householdId, userId, personId, account, category, origin } =
      await bootstrapLedger();

    const tx = await repos.transactions.insertIncome({
      householdId,
      accountId: account.id,
      personId,
      categoryId: category.id,
      originId: origin.id,
      createdByUserId: userId,
      amountMinor: 250_000,
      originalCurrencyCode: "BDT",
      originalAmountMinor: 250_000,
      exchangeRateToBdtMinor: 100,
      description: "April salary",
      transactionDate: "2026-04-01",
    });

    expect(tx.type).toBe("income");
    expect(tx.origin).toEqual({ id: origin.id, name: "Acme Corp" });

    const after = await repos.accounts.findById({
      householdId,
      id: account.id,
    });
    expect(after?.currentBalanceMinor).toBe(100_000 + 250_000);
  });

  test("insertTransfer creates a linked pair and moves both balances", async () => {
    const {
      repos,
      householdId,
      userId,
      personId,
      account,
      destinationAccount,
    } = await bootstrapLedger();

    const result = await db.begin(async (tx: BunSqlDatabase) => {
      const txRepos = createRepositories({ db: tx });
      return txRepos.transactions.insertTransfer({
        householdId,
        sourceAccountId: account.id,
        destinationAccountId: destinationAccount.id,
        personId,
        createdByUserId: userId,
        amountMinor: 10_000,
        description: "Move to savings",
        transactionDate: "2026-04-03",
      });
    });

    expect(result.expense.transferGroupId).toBe(result.transferGroupId);
    expect(result.income.transferGroupId).toBe(result.transferGroupId);
    expect(result.expense.category).toBeNull();
    expect(result.income.origin).toBeNull();

    const source = await repos.accounts.findById({
      householdId,
      id: account.id,
    });
    const dest = await repos.accounts.findById({
      householdId,
      id: destinationAccount.id,
    });
    expect(source?.currentBalanceMinor).toBe(100_000 - 10_000);
    expect(dest?.currentBalanceMinor).toBe(50_000 + 10_000);
  });

  test("remove reverses an expense's balance delta", async () => {
    const { repos, householdId, userId, personId, account, category } =
      await bootstrapLedger();

    const tx = await repos.transactions.insertExpense({
      householdId,
      accountId: account.id,
      personId,
      categoryId: category.id,
      createdByUserId: userId,
      amountMinor: 4_000,
      originalCurrencyCode: "BDT",
      originalAmountMinor: 4_000,
      exchangeRateToBdtMinor: 100,
      description: null,
      transactionDate: "2026-04-05",
    });

    const removed = await repos.transactions.remove({
      householdId,
      id: tx.id,
    });
    expect(removed).toBe(true);

    const after = await repos.accounts.findById({
      householdId,
      id: account.id,
    });
    expect(after?.currentBalanceMinor).toBe(100_000);
  });

  test("remove of a transfer leg deletes both legs and reverses both balances", async () => {
    const {
      repos,
      householdId,
      userId,
      personId,
      account,
      destinationAccount,
    } = await bootstrapLedger();

    const transfer = await db.begin(async (tx: BunSqlDatabase) => {
      const txRepos = createRepositories({ db: tx });
      return txRepos.transactions.insertTransfer({
        householdId,
        sourceAccountId: account.id,
        destinationAccountId: destinationAccount.id,
        personId,
        createdByUserId: userId,
        amountMinor: 25_000,
        description: null,
        transactionDate: "2026-04-03",
      });
    });

    await repos.transactions.remove({
      householdId,
      id: transfer.expense.id,
    });

    const source = await repos.accounts.findById({
      householdId,
      id: account.id,
    });
    const dest = await repos.accounts.findById({
      householdId,
      id: destinationAccount.id,
    });
    expect(source?.currentBalanceMinor).toBe(100_000);
    expect(dest?.currentBalanceMinor).toBe(50_000);

    const list = await repos.transactions.listByHousehold({
      householdId,
      page: 1,
      pageSize: 20,
    });
    expect(list.total).toBe(0);
  });

  test("update of amount adjusts the balance by the delta only", async () => {
    const { repos, householdId, userId, personId, account, category } =
      await bootstrapLedger();

    const tx = await repos.transactions.insertExpense({
      householdId,
      accountId: account.id,
      personId,
      categoryId: category.id,
      createdByUserId: userId,
      amountMinor: 5_000,
      originalCurrencyCode: "BDT",
      originalAmountMinor: 5_000,
      exchangeRateToBdtMinor: 100,
      description: null,
      transactionDate: "2026-04-05",
    });

    await repos.transactions.update({
      householdId,
      id: tx.id,
      patch: {
        amountMinor: 7_000,
        originalAmountMinor: 7_000,
      },
    });

    const after = await repos.accounts.findById({
      householdId,
      id: account.id,
    });
    expect(after?.currentBalanceMinor).toBe(100_000 - 7_000);
  });

  test("listByHousehold filters and paginates", async () => {
    const { repos, householdId, userId, personId, account, category, origin } =
      await bootstrapLedger();

    for (let i = 0; i < 3; i++) {
      await repos.transactions.insertExpense({
        householdId,
        accountId: account.id,
        personId,
        categoryId: category.id,
        createdByUserId: userId,
        amountMinor: 100 * (i + 1),
        originalCurrencyCode: "BDT",
        originalAmountMinor: 100 * (i + 1),
        exchangeRateToBdtMinor: 100,
        description: null,
        transactionDate: `2026-04-0${i + 1}`,
      });
    }
    await repos.transactions.insertIncome({
      householdId,
      accountId: account.id,
      personId,
      categoryId: category.id,
      originId: origin.id,
      createdByUserId: userId,
      amountMinor: 900,
      originalCurrencyCode: "BDT",
      originalAmountMinor: 900,
      exchangeRateToBdtMinor: 100,
      description: null,
      transactionDate: "2026-04-04",
    });

    const expenses = await repos.transactions.listByHousehold({
      householdId,
      filters: { type: "expense" },
      page: 1,
      pageSize: 10,
    });
    expect(expenses.total).toBe(3);
    expect(expenses.data.every((t) => t.type === "expense")).toBe(true);

    const paginated = await repos.transactions.listByHousehold({
      householdId,
      page: 1,
      pageSize: 2,
    });
    expect(paginated.total).toBe(4);
    expect(paginated.data).toHaveLength(2);
  });

  test("does not leak transactions across households", async () => {
    const { repos, householdId, userId, personId, account, category } =
      await bootstrapLedger();

    await repos.transactions.insertExpense({
      householdId,
      accountId: account.id,
      personId,
      categoryId: category.id,
      createdByUserId: userId,
      amountMinor: 500,
      originalCurrencyCode: "BDT",
      originalAmountMinor: 500,
      exchangeRateToBdtMinor: 100,
      description: null,
      transactionDate: "2026-04-05",
    });

    const otherList = await repos.transactions.listByHousehold({
      householdId: SEED_HOUSEHOLDS.test.id,
      page: 1,
      pageSize: 20,
    });
    expect(otherList.total).toBe(0);
    expect(otherList.data).toHaveLength(0);
  });
});
