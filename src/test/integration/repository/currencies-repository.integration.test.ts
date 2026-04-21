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
import { createCurrenciesRepository } from "@/libs/server/db/repository/currencies-repository";
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

describe("currencies-repository", () => {
  const householdId = SEED_HOUSEHOLDS.real.id;

  test("findBase returns the seeded BDT row", async () => {
    const repo = createCurrenciesRepository({ db });
    const base = await repo.findBase(householdId);
    expect(base.code).toBe("BDT");
    expect(base.isBase).toBe(true);
    expect(base.rateToBdtMinor).toBe(100);
  });

  test("listByHousehold sorts base currency first", async () => {
    const repo = createCurrenciesRepository({ db });
    await repo.insert({
      householdId,
      code: "USD",
      symbol: "$",
      name: "US Dollar",
      rateToBdtMinor: 12200,
    });

    const list = await repo.listByHousehold(householdId);
    expect(list[0]!.code).toBe("BDT");
    expect(list[1]!.code).toBe("USD");
  });

  test("blocks a second base currency via the partial unique index", async () => {
    const repo = createCurrenciesRepository({ db });
    try {
      await repo.insert({
        householdId,
        code: "EUR",
        symbol: "€",
        name: "Euro",
        rateToBdtMinor: 14000,
        isBase: true,
      });
      throw new Error("Expected duplicate base insert to fail.");
    } catch (error) {
      // Surfaced as a 409 (mapped unique violation) because the partial
      // unique index on (household_id) WHERE is_base = TRUE fires.
      expect(isApiError(error) && error.code).toBe("conflict");
    }
  });

  test("refuses to delete the base currency", async () => {
    const repo = createCurrenciesRepository({ db });
    const base = await repo.findBase(householdId);

    try {
      await repo.remove({ householdId, id: base.id });
      throw new Error("Expected removing base currency to throw.");
    } catch (error) {
      expect(isApiError(error) && error.code).toBe("conflict");
    }
  });

  test("removes a non-base currency", async () => {
    const repo = createCurrenciesRepository({ db });
    const usd = await repo.insert({
      householdId,
      code: "USD",
      symbol: "$",
      name: "US Dollar",
      rateToBdtMinor: 12200,
    });

    const removed = await repo.remove({ householdId, id: usd.id });
    expect(removed).toBe(true);
    expect(await repo.findByCode({ householdId, code: "USD" })).toBeNull();
  });
});
