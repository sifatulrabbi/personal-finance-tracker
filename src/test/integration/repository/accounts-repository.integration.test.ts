import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { isApiError } from "@/libs/server/api/errors";
import type { BunSqlDatabase } from "@/libs/server/db/client";
import { createAccountsRepository } from "@/libs/server/db/repository/accounts-repository";
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

describe("accounts-repository", () => {
  const householdId = SEED_HOUSEHOLDS.real.id;

  test("inserts, lists, finds, and deletes accounts", async () => {
    const repo = createAccountsRepository({ db });

    const created = await repo.insert({
      householdId,
      name: "Main Wallet",
      description: "Everyday spend",
      initialBalanceMinor: 50000,
    });

    expect(created).toMatchObject({
      householdId,
      name: "Main Wallet",
      description: "Everyday spend",
      initialBalanceMinor: 50000,
      currentBalanceMinor: 50000,
    });
    expect(typeof created.id).toBe("string");

    const all = await repo.listByHousehold(householdId);
    expect(all).toHaveLength(1);

    const found = await repo.findById({ householdId, id: created.id });
    expect(found?.name).toBe("Main Wallet");

    const removed = await repo.remove({ householdId, id: created.id });
    expect(removed).toBe(true);
    expect(await repo.findById({ householdId, id: created.id })).toBeNull();
  });

  test("rejects duplicate account names with a 409 conflict", async () => {
    const repo = createAccountsRepository({ db });

    await repo.insert({
      householdId,
      name: "Main Wallet",
      description: null,
      initialBalanceMinor: 0,
    });

    try {
      await repo.insert({
        householdId,
        name: "Main Wallet",
        description: null,
        initialBalanceMinor: 0,
      });
      throw new Error("Expected duplicate insert to throw.");
    } catch (error) {
      expect(isApiError(error) && error.code).toBe("conflict");
    }
  });

  test("updates name and description, preserving unspecified fields", async () => {
    const repo = createAccountsRepository({ db });
    const created = await repo.insert({
      householdId,
      name: "Savings",
      description: "Emergency fund",
      initialBalanceMinor: 0,
    });

    const renamed = await repo.update({
      householdId,
      id: created.id,
      patch: { name: "Rainy Day" },
    });
    expect(renamed?.name).toBe("Rainy Day");
    expect(renamed?.description).toBe("Emergency fund");

    const cleared = await repo.update({
      householdId,
      id: created.id,
      patch: { description: null },
    });
    expect(cleared?.description).toBeNull();
  });

  test("adjustBalance moves current_balance_minor by the signed delta", async () => {
    const repo = createAccountsRepository({ db });
    const created = await repo.insert({
      householdId,
      name: "Main",
      description: null,
      initialBalanceMinor: 1000,
    });

    await db.begin(async (tx: BunSqlDatabase) => {
      const txRepo = createAccountsRepository({ db: tx });
      await txRepo.adjustBalance({
        householdId,
        id: created.id,
        deltaMinor: -250,
      });
      await txRepo.adjustBalance({
        householdId,
        id: created.id,
        deltaMinor: 100,
      });
    });

    const after = await repo.findById({ householdId, id: created.id });
    expect(after?.currentBalanceMinor).toBe(850);
    expect(after?.initialBalanceMinor).toBe(1000);
  });

  test("isolates rows across households", async () => {
    const repo = createAccountsRepository({ db });
    const otherHouseholdId = SEED_HOUSEHOLDS.test.id;

    await repo.insert({
      householdId,
      name: "Shared Name",
      description: null,
      initialBalanceMinor: 0,
    });
    await repo.insert({
      householdId: otherHouseholdId,
      name: "Shared Name",
      description: null,
      initialBalanceMinor: 0,
    });

    const realOnly = await repo.listByHousehold(householdId);
    const testOnly = await repo.listByHousehold(otherHouseholdId);
    expect(realOnly).toHaveLength(1);
    expect(testOnly).toHaveLength(1);
    expect(realOnly[0]!.householdId).toBe(householdId);
    expect(testOnly[0]!.householdId).toBe(otherHouseholdId);
  });
});
