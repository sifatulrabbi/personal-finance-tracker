import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { createTestDb, type BunSqlDatabase } from "@/libs/server/db/client";
import { applyMigrations } from "@/libs/server/db/migrations";
import { SEED_HOUSEHOLDS, seedDatabase } from "@/libs/server/db/seed";

let db: BunSqlDatabase;

async function resetPublicSchema(): Promise<void> {
  await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}

async function countRows(tableName: string): Promise<number> {
  const rows = (await db.unsafe(
    `SELECT COUNT(*)::int AS count FROM ${tableName}`,
  )) as Array<{ count: number }>;

  return rows[0]?.count ?? 0;
}

async function expectSeedToFail(): Promise<void> {
  try {
    await seedDatabase({ db });
    throw new Error("Expected seed to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toBe("Expected seed to fail.");
  }
}

beforeAll(async () => {
  db = createTestDb();
});

beforeEach(async () => {
  await resetPublicSchema();
});

afterAll(async () => {
  await db.close();
});

describe("seed integration", () => {
  test("creates the expected households, drafted users, default people, and base currencies", async () => {
    await applyMigrations({ db });

    const result = await seedDatabase({ db });

    const householdRows = (await db.unsafe(`
      SELECT id::text AS id, name
      FROM households
      ORDER BY name ASC
    `)) as Array<{ id: string; name: string }>;

    const userRows = (await db.unsafe(`
      SELECT
        id::text AS id,
        household_id::text AS household_id,
        email,
        name,
        workos_user_id,
        is_drafted
      FROM users
      ORDER BY email ASC
    `)) as Array<{
      id: string;
      household_id: string;
      email: string;
      name: string | null;
      workos_user_id: string | null;
      is_drafted: boolean;
    }>;

    const personRows = (await db.unsafe(`
      SELECT id::text AS id, household_id::text AS household_id, name, is_default
      FROM people
      ORDER BY household_id ASC
    `)) as Array<{
      id: string;
      household_id: string;
      name: string;
      is_default: boolean;
    }>;

    const currencyRows = (await db.unsafe(`
      SELECT
        id::text AS id,
        household_id::text AS household_id,
        code,
        symbol,
        name,
        rate_to_bdt_minor,
        is_base
      FROM currencies
      ORDER BY household_id ASC
    `)) as Array<{
      id: string;
      household_id: string;
      code: string;
      symbol: string;
      name: string;
      rate_to_bdt_minor: number | string;
      is_base: boolean;
    }>;

    expect(result.records.every((record) => record.action === "inserted")).toBe(
      true,
    );
    expect(householdRows).toEqual([
      {
        id: SEED_HOUSEHOLDS.real.id,
        name: SEED_HOUSEHOLDS.real.name,
      },
      {
        id: SEED_HOUSEHOLDS.test.id,
        name: SEED_HOUSEHOLDS.test.name,
      },
    ]);
    expect(userRows).toEqual([
      {
        id: SEED_HOUSEHOLDS.real.seedUser.id,
        household_id: SEED_HOUSEHOLDS.real.id,
        email: SEED_HOUSEHOLDS.real.seedUser.email,
        name: null,
        workos_user_id: null,
        is_drafted: true,
      },
      {
        id: SEED_HOUSEHOLDS.test.seedUser.id,
        household_id: SEED_HOUSEHOLDS.test.id,
        email: SEED_HOUSEHOLDS.test.seedUser.email,
        name: null,
        workos_user_id: null,
        is_drafted: true,
      },
    ]);
    expect(personRows).toEqual([
      {
        id: SEED_HOUSEHOLDS.real.defaultPerson.id,
        household_id: SEED_HOUSEHOLDS.real.id,
        name: SEED_HOUSEHOLDS.real.defaultPerson.name,
        is_default: true,
      },
      {
        id: SEED_HOUSEHOLDS.test.defaultPerson.id,
        household_id: SEED_HOUSEHOLDS.test.id,
        name: SEED_HOUSEHOLDS.test.defaultPerson.name,
        is_default: true,
      },
    ]);
    expect(currencyRows).toEqual([
      {
        id: SEED_HOUSEHOLDS.real.baseCurrency.id,
        household_id: SEED_HOUSEHOLDS.real.id,
        code: SEED_HOUSEHOLDS.real.baseCurrency.code,
        symbol: SEED_HOUSEHOLDS.real.baseCurrency.symbol,
        name: SEED_HOUSEHOLDS.real.baseCurrency.name,
        rate_to_bdt_minor: String(
          SEED_HOUSEHOLDS.real.baseCurrency.rateToBdtMinor,
        ),
        is_base: true,
      },
      {
        id: SEED_HOUSEHOLDS.test.baseCurrency.id,
        household_id: SEED_HOUSEHOLDS.test.id,
        code: SEED_HOUSEHOLDS.test.baseCurrency.code,
        symbol: SEED_HOUSEHOLDS.test.baseCurrency.symbol,
        name: SEED_HOUSEHOLDS.test.baseCurrency.name,
        rate_to_bdt_minor: String(
          SEED_HOUSEHOLDS.test.baseCurrency.rateToBdtMinor,
        ),
        is_base: true,
      },
    ]);
  });

  test("is idempotent across repeated runs", async () => {
    await applyMigrations({ db });

    const firstRun = await seedDatabase({ db });
    const secondRun = await seedDatabase({ db });

    expect(
      firstRun.records.every((record) => record.action === "inserted"),
    ).toBe(true);
    expect(
      secondRun.records.every((record) => record.action === "skipped"),
    ).toBe(true);
    expect(await countRows("households")).toBe(2);
    expect(await countRows("users")).toBe(2);
    expect(await countRows("people")).toBe(2);
    expect(await countRows("currencies")).toBe(2);
  });

  test("repairs partial prior seed state by inserting only missing rows", async () => {
    await applyMigrations({ db });
    await db`
      INSERT INTO households (id, name)
      VALUES (${SEED_HOUSEHOLDS.real.id}, ${SEED_HOUSEHOLDS.real.name})
    `;

    const result = await seedDatabase({ db });

    expect(result.records).toEqual([
      { action: "skipped", table: "households", key: "real.household" },
      { action: "inserted", table: "users", key: "real.seedUser" },
      { action: "inserted", table: "people", key: "real.defaultPerson" },
      { action: "inserted", table: "currencies", key: "real.baseCurrency" },
      { action: "inserted", table: "households", key: "test.household" },
      { action: "inserted", table: "users", key: "test.seedUser" },
      { action: "inserted", table: "people", key: "test.defaultPerson" },
      { action: "inserted", table: "currencies", key: "test.baseCurrency" },
    ]);
    expect(await countRows("households")).toBe(2);
    expect(await countRows("users")).toBe(2);
    expect(await countRows("people")).toBe(2);
    expect(await countRows("currencies")).toBe(2);
  });

  test("does not overwrite existing seed-id rows", async () => {
    await applyMigrations({ db });
    await db`
      INSERT INTO households (id, name)
      VALUES (${SEED_HOUSEHOLDS.real.id}, ${"Existing Real Household Name"})
    `;

    const result = await seedDatabase({ db });
    const rows = (await db`
      SELECT name
      FROM households
      WHERE id = ${SEED_HOUSEHOLDS.real.id}
    `) as Array<{ name: string }>;

    expect(result.records[0]).toEqual({
      action: "skipped",
      table: "households",
      key: "real.household",
    });
    expect(rows).toEqual([{ name: "Existing Real Household Name" }]);
  });

  test("fails when a seed household name exists under a different id", async () => {
    await applyMigrations({ db });
    await db`
      INSERT INTO households (id, name)
      VALUES (
        ${"00000000-0000-4000-8000-000000000999"},
        ${SEED_HOUSEHOLDS.real.name}
      )
    `;

    expect(seedDatabase({ db })).rejects.toThrow(
      `Seed household "${SEED_HOUSEHOLDS.real.name}" already exists with a different id.`,
    );
  });

  test("fails when migrations have not been applied", async () => {
    await expectSeedToFail();
  });
});
