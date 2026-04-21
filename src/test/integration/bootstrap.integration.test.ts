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

/**
 * End-to-end bootstrap test: proves that a freshly migrated-and-seeded
 * database is usable for the golden path — the real user signs in, their
 * drafted row is activated, they create an account, they record a BDT
 * expense, and the expense is visible on reload with the correct account
 * balance. If any phase of the plan (migrations, seed, repositories, route
 * logic) regresses, this test fails.
 */

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

describe("bootstrap flow: migrate + seed + first-login + expense round-trip", () => {
  test("a seeded user can sign in for the first time and record a BDT expense", async () => {
    const repos = createRepositories({ db });
    const seed = SEED_HOUSEHOLDS.real;

    // 1. Confirm the drafted invitation exists from the seed (pre-signin).
    const drafted = await repos.users.findByEmail(seed.seedUser.email);
    expect(drafted).not.toBeNull();
    expect(drafted!.isDrafted).toBe(true);
    expect(drafted!.workosUserId).toBeNull();

    // 2. Simulate the first-login activation that resolveSessionUser performs
    //    when WorkOS returns a freshly authenticated user. (Testing
    //    resolveSessionUser itself would require mocking @workos-inc
    //    modules globally, which interferes with other test files.)
    await repos.users.activateDrafted({
      id: drafted!.id,
      workosUserId: "workos_user_bootstrap",
      name: "Sifatul Rabbi",
    });
    const activated = await repos.users.findByEmail(seed.seedUser.email);
    expect(activated!.isDrafted).toBe(false);
    expect(activated!.workosUserId).toBe("workos_user_bootstrap");
    expect(activated!.name).toBe("Sifatul Rabbi");

    // 3. The household is fully bootstrapped: one default person, one BDT
    //    base currency, ready to receive a transaction.
    const baseCurrency = await repos.currencies.findBase(seed.id);
    expect(baseCurrency.code).toBe("BDT");
    const defaultPerson = await repos.people.findDefault(seed.id);
    expect(defaultPerson?.name).toBe("Household");

    // 4. The user creates their first account from scratch.
    const account = await repos.accounts.insert({
      householdId: seed.id,
      name: "Main Wallet",
      description: "Everyday spend",
      initialBalanceMinor: 100_000,
    });
    expect(account.currentBalanceMinor).toBe(100_000);

    // 5. The user records a BDT expense, including inline category upsert.
    const expense = await db.begin(async (tx: BunSqlDatabase) => {
      const txRepos = createRepositories({ db: tx });
      const category = await txRepos.categories.upsertByName({
        householdId: seed.id,
        name: "Groceries",
      });
      return txRepos.transactions.insertExpense({
        householdId: seed.id,
        accountId: account.id,
        personId: defaultPerson!.id,
        categoryId: category.id,
        createdByUserId: activated!.id,
        amountMinor: 3_250,
        originalCurrencyCode: "BDT",
        originalAmountMinor: 3_250,
        exchangeRateToBdtMinor: 100,
        description: "Weekly groceries",
        transactionDate: "2026-04-20",
      });
    });
    expect(expense.amountMinor).toBe(3_250);
    expect(expense.category?.name).toBe("Groceries");

    // 6. Reload: the expense is durably persisted, and the account balance
    //    moved by exactly the expense amount.
    const list = await repos.transactions.listByHousehold({
      householdId: seed.id,
      page: 1,
      pageSize: 10,
    });
    expect(list.total).toBe(1);
    expect(list.data[0]!.id).toBe(expense.id);

    const accountAfter = await repos.accounts.findById({
      householdId: seed.id,
      id: account.id,
    });
    expect(accountAfter?.currentBalanceMinor).toBe(100_000 - 3_250);
  });

  test("cross-household reads do not leak: the other seeded household sees zero transactions", async () => {
    const repos = createRepositories({ db });

    // Put a transaction in the "real" household.
    const account = await repos.accounts.insert({
      householdId: SEED_HOUSEHOLDS.real.id,
      name: "Main Wallet",
      description: null,
      initialBalanceMinor: 10_000,
    });
    await db.begin(async (tx: BunSqlDatabase) => {
      const txRepos = createRepositories({ db: tx });
      const category = await txRepos.categories.upsertByName({
        householdId: SEED_HOUSEHOLDS.real.id,
        name: "Misc",
      });
      return txRepos.transactions.insertExpense({
        householdId: SEED_HOUSEHOLDS.real.id,
        accountId: account.id,
        personId: SEED_HOUSEHOLDS.real.defaultPerson.id,
        categoryId: category.id,
        createdByUserId: SEED_HOUSEHOLDS.real.seedUser.id,
        amountMinor: 500,
        originalCurrencyCode: "BDT",
        originalAmountMinor: 500,
        exchangeRateToBdtMinor: 100,
        description: null,
        transactionDate: "2026-04-20",
      });
    });

    // Read from the "test" household — it should see nothing.
    const testList = await repos.transactions.listByHousehold({
      householdId: SEED_HOUSEHOLDS.test.id,
      page: 1,
      pageSize: 10,
    });
    expect(testList.total).toBe(0);
    expect(testList.data).toEqual([]);

    const testAccounts = await repos.accounts.listByHousehold(
      SEED_HOUSEHOLDS.test.id,
    );
    expect(testAccounts).toEqual([]);
  });
});
