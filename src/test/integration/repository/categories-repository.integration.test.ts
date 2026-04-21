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
import { createCategoriesRepository } from "@/libs/server/db/repository/categories-repository";
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

describe("categories-repository", () => {
  const householdId = SEED_HOUSEHOLDS.real.id;

  test("upsertByName returns the existing row on the second call", async () => {
    const repo = createCategoriesRepository({ db });

    const first = await repo.upsertByName({ householdId, name: "Groceries" });
    const second = await repo.upsertByName({ householdId, name: "Groceries" });

    expect(first.id).toBe(second.id);
    const all = await repo.listByHousehold(householdId);
    expect(all).toHaveLength(1);
  });

  test("same name in a different household is a different row", async () => {
    const repo = createCategoriesRepository({ db });

    const a = await repo.upsertByName({ householdId, name: "Groceries" });
    const b = await repo.upsertByName({
      householdId: SEED_HOUSEHOLDS.test.id,
      name: "Groceries",
    });

    expect(a.id).not.toBe(b.id);
  });

  test("rejects duplicate insert with a 409", async () => {
    const repo = createCategoriesRepository({ db });
    await repo.insert({ householdId, name: "Rent", description: null });

    try {
      await repo.insert({ householdId, name: "Rent", description: null });
      throw new Error("Expected conflict.");
    } catch (error) {
      expect(isApiError(error) && error.code).toBe("conflict");
    }
  });
});
