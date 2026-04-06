import { describe, expect, mock, test } from "bun:test";

import type { BunSqlDatabase } from "@/libs/server/db/client";
import { SEED_HOUSEHOLDS, seedDatabase } from "@/libs/server/db/seed";

type QueryRows = Array<{ id: string }>;

function createSeedDbStub(resultsByCall: QueryRows[] = []) {
  const queryValues: unknown[][] = [];
  const pendingResults = [...resultsByCall];
  const query = mock(async (_strings: TemplateStringsArray, ...values) => {
    const sql = _strings.join("");

    queryValues.push(values);

    if (sql.includes("SELECT id::text AS id")) {
      return [];
    }

    return pendingResults.shift() ?? [{ id: String(values[0]) }];
  });

  const db = Object.assign(query, {
    begin: mock(async (callback: (db: BunSqlDatabase) => Promise<unknown>) =>
      callback(db as unknown as BunSqlDatabase),
    ),
  });

  return {
    db: db as unknown as BunSqlDatabase,
    query,
    queryValues,
    begin: db.begin,
  };
}

describe("seed database", () => {
  test("exposes the required seed constants", () => {
    expect(SEED_HOUSEHOLDS.real.name).toBe("Sifatul's Household");
    expect(SEED_HOUSEHOLDS.real.seedUser.email).toBe(
      "mdsifatulislam.rabbi@gmail.com",
    );
    expect(SEED_HOUSEHOLDS.real.defaultPerson.name).toBe("Household");
    expect(SEED_HOUSEHOLDS.test.name).toBe("Test Household");
    expect(SEED_HOUSEHOLDS.test.seedUser.email).toBe("sifatuli.r@gmail.com");
    expect(SEED_HOUSEHOLDS.test.defaultPerson.name).toBe("Household");
  });

  test("seeds all required records in one transaction", async () => {
    const { db, query, begin } = createSeedDbStub();

    const result = await seedDatabase({ db });

    expect(begin).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(8);
    expect(result.records).toEqual([
      { action: "inserted", table: "households", key: "real.household" },
      { action: "inserted", table: "users", key: "real.seedUser" },
      { action: "inserted", table: "people", key: "real.defaultPerson" },
      { action: "inserted", table: "households", key: "test.household" },
      { action: "inserted", table: "users", key: "test.seedUser" },
      { action: "inserted", table: "people", key: "test.defaultPerson" },
    ]);
  });

  test("marks records as skipped when inserts return no rows", async () => {
    const { db } = createSeedDbStub([[], [], [], [], [], []]);

    const result = await seedDatabase({ db });

    expect(result.records).toEqual([
      { action: "skipped", table: "households", key: "real.household" },
      { action: "skipped", table: "users", key: "real.seedUser" },
      { action: "skipped", table: "people", key: "real.defaultPerson" },
      { action: "skipped", table: "households", key: "test.household" },
      { action: "skipped", table: "users", key: "test.seedUser" },
      { action: "skipped", table: "people", key: "test.defaultPerson" },
    ]);
  });

  test("inserts seed users as drafted invitations", async () => {
    const { db, queryValues } = createSeedDbStub();

    await seedDatabase({ db });

    expect(queryValues).toContainEqual([
      SEED_HOUSEHOLDS.real.seedUser.id,
      SEED_HOUSEHOLDS.real.id,
      SEED_HOUSEHOLDS.real.seedUser.email,
      null,
      null,
      true,
    ]);
    expect(queryValues).toContainEqual([
      SEED_HOUSEHOLDS.test.seedUser.id,
      SEED_HOUSEHOLDS.test.id,
      SEED_HOUSEHOLDS.test.seedUser.email,
      null,
      null,
      true,
    ]);
  });

  test("fails when a seed household name exists under a different id", async () => {
    const query = mock(async (_strings: TemplateStringsArray) => {
      const sql = _strings.join("");

      if (sql.includes("SELECT id::text AS id")) {
        return [{ id: "00000000-0000-4000-8000-000000000999" }];
      }

      return [];
    });
    const db = Object.assign(query, {
      begin: mock(async (callback: (db: BunSqlDatabase) => Promise<unknown>) =>
        callback(db as unknown as BunSqlDatabase),
      ),
    }) as unknown as BunSqlDatabase;

    await expect(seedDatabase({ db })).rejects.toThrow(
      `Seed household "${SEED_HOUSEHOLDS.real.name}" already exists with a different id.`,
    );
  });
});
