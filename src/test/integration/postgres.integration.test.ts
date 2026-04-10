import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createId } from "@/libs/id";
import { createTestDb, type BunSqlDatabase } from "@/libs/server/db/client";
import { applyMigrations } from "@/libs/server/db/migrations";

const EXPECTED_MIGRATION_FILES = [
  "0001-enable-pgcrypto.sql",
  "0002-create-households.sql",
  "0003-create-users.sql",
  "0004-create-people.sql",
  "0005-create-categories.sql",
  "0006-create-accounts.sql",
  "0007-create-origins.sql",
  "0008-create-transactions.sql",
  "0009-create-currencies.sql",
  "0010-add-currency-to-transactions.sql",
];

let db: BunSqlDatabase;

async function resetPublicSchema(): Promise<void> {
  await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}

async function expectQueryToFail(query: Promise<unknown>): Promise<void> {
  try {
    await query;
    throw new Error("Expected query to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toBe("Expected query to fail.");
  }
}

async function seedLedgerContext() {
  const householdId = createId();
  const userId = createId();
  const personId = createId();
  const categoryId = createId();
  const accountId = createId();
  const originId = createId();

  await db`
    INSERT INTO households (id, name)
    VALUES (${householdId}, ${"Rabbi Family"})
  `;

  await db`
    INSERT INTO users (id, household_id, email, name, is_drafted)
    VALUES (
      ${userId},
      ${householdId},
      ${"maintainer@example.com"},
      ${"Maintainer"},
      ${false}
    )
  `;

  await db`
    INSERT INTO people (id, household_id, name, is_default)
    VALUES (${personId}, ${householdId}, ${"Household"}, ${true})
  `;

  await db`
    INSERT INTO categories (id, household_id, name)
    VALUES (${categoryId}, ${householdId}, ${"Groceries"})
  `;

  await db`
    INSERT INTO accounts (
      id,
      household_id,
      name,
      initial_balance_minor,
      current_balance_minor
    )
    VALUES (
      ${accountId},
      ${householdId},
      ${"Main Wallet"},
      ${0},
      ${0}
    )
  `;

  await db`
    INSERT INTO origins (id, household_id, name)
    VALUES (${originId}, ${householdId}, ${"Salary"})
  `;

  return {
    householdId,
    userId,
    personId,
    categoryId,
    accountId,
    originId,
  };
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

describe("postgres integration", () => {
  test("connects and executes a basic query", async () => {
    const rows = (await db.unsafe("SELECT 1 AS value")) as Array<{
      value: number;
    }>;

    expect(rows).toEqual([{ value: 1 }]);
  });

  test("commits successful transactions", async () => {
    await db.unsafe(`
      CREATE TABLE transaction_probe (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    await db.begin(async (transactionDb: BunSqlDatabase) => {
      await transactionDb`INSERT INTO transaction_probe (name) VALUES (${`commit`})`;
    });

    const rows = (await db.unsafe(`
      SELECT name
      FROM transaction_probe
      WHERE name = 'commit'
    `)) as Array<{ name: string }>;

    expect(rows).toEqual([{ name: "commit" }]);
  });

  test("rolls back failed transactions", async () => {
    await db.unsafe(`
      CREATE TABLE transaction_probe (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    await expect(
      db.begin(async (transactionDb: BunSqlDatabase) => {
        await transactionDb`INSERT INTO transaction_probe (name) VALUES (${`rollback`})`;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const rows = (await db.unsafe(`
      SELECT name
      FROM transaction_probe
      WHERE name = 'rollback'
    `)) as Array<{ name: string }>;

    expect(rows).toEqual([]);
  });

  test("applies migrations and records them once", async () => {
    const firstRun = await applyMigrations({ db });
    const secondRun = await applyMigrations({ db });
    const rows = (await db.unsafe(`
      SELECT filename
      FROM schema_migrations
      ORDER BY filename ASC
    `)) as Array<{ filename: string }>;

    expect(firstRun.appliedMigrations).toEqual(EXPECTED_MIGRATION_FILES);
    expect(secondRun.appliedMigrations).toEqual([]);
    expect(rows.map((row) => row.filename)).toEqual(EXPECTED_MIGRATION_FILES);
  });

  test("creates the expected household-ledger tables", async () => {
    await applyMigrations({ db });

    const rows = (await db.unsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `)) as Array<{ table_name: string }>;

    expect(rows.map((row) => row.table_name)).toEqual([
      "accounts",
      "categories",
      "currencies",
      "households",
      "origins",
      "people",
      "schema_migrations",
      "transactions",
      "users",
    ]);
  });

  test("stores UUID-compatible IDs generated from ULIDs", async () => {
    await applyMigrations({ db });

    const householdId = createId();

    await db`
      INSERT INTO households (id, name)
      VALUES (${householdId}, ${"ID Acceptance"})
    `;

    const rows = (await db.unsafe(`
      SELECT id::text AS id
      FROM households
      WHERE name = 'ID Acceptance'
    `)) as Array<{ id: string }>;

    expect(rows).toEqual([{ id: householdId }]);
  });

  test("defines important transaction columns with the expected Postgres types", async () => {
    await applyMigrations({ db });

    const rows = (await db.unsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name IN (
          'id',
          'account_id',
          'amount_minor',
          'transaction_date',
          'transfer_group_id'
        )
      ORDER BY column_name ASC
    `)) as Array<{ column_name: string; data_type: string }>;

    expect(rows).toEqual([
      { column_name: "account_id", data_type: "uuid" },
      { column_name: "amount_minor", data_type: "bigint" },
      { column_name: "id", data_type: "uuid" },
      { column_name: "transaction_date", data_type: "date" },
      { column_name: "transfer_group_id", data_type: "uuid" },
    ]);
  });

  test("enforces household-local uniqueness for people, categories, accounts, and origins", async () => {
    await applyMigrations({ db });

    const context = await seedLedgerContext();
    const secondHouseholdId = createId();

    await db`
      INSERT INTO households (id, name)
      VALUES (${secondHouseholdId}, ${"Test Household"})
    `;

    await expectQueryToFail(
      db`
        INSERT INTO people (id, household_id, name)
        VALUES (${createId()}, ${context.householdId}, ${"Household"})
      `,
    );

    await expectQueryToFail(
      db`
        INSERT INTO categories (id, household_id, name)
        VALUES (${createId()}, ${context.householdId}, ${"Groceries"})
      `,
    );

    await expectQueryToFail(
      db`
        INSERT INTO accounts (
          id,
          household_id,
          name,
          initial_balance_minor,
          current_balance_minor
        )
        VALUES (
          ${createId()},
          ${context.householdId},
          ${"Main Wallet"},
          ${0},
          ${0}
        )
      `,
    );

    await expectQueryToFail(
      db`
        INSERT INTO origins (id, household_id, name)
        VALUES (${createId()}, ${context.householdId}, ${"Salary"})
      `,
    );

    await db`
      INSERT INTO categories (id, household_id, name)
      VALUES (${createId()}, ${secondHouseholdId}, ${"Groceries"})
    `;
  });

  test("enforces global user email uniqueness and non-null workos uniqueness", async () => {
    await applyMigrations({ db });

    const firstHouseholdId = createId();
    const secondHouseholdId = createId();

    await db`
      INSERT INTO households (id, name)
      VALUES (${firstHouseholdId}, ${"First Household"})
    `;

    await db`
      INSERT INTO households (id, name)
      VALUES (${secondHouseholdId}, ${"Second Household"})
    `;

    await db`
      INSERT INTO users (
        id,
        household_id,
        email,
        name,
        workos_user_id,
        is_drafted
      )
      VALUES (
        ${createId()},
        ${firstHouseholdId},
        ${"shared@example.com"},
        ${"First"},
        ${"workos-user-1"},
        ${false}
      )
    `;

    await expectQueryToFail(
      db`
        INSERT INTO users (
          id,
          household_id,
          email,
          name,
          is_drafted
        )
        VALUES (
          ${createId()},
          ${secondHouseholdId},
          ${"shared@example.com"},
          ${"Second"},
          ${true}
        )
      `,
    );

    await expectQueryToFail(
      db`
        INSERT INTO users (
          id,
          household_id,
          email,
          name,
          workos_user_id,
          is_drafted
        )
        VALUES (
          ${createId()},
          ${secondHouseholdId},
          ${"another@example.com"},
          ${"Second"},
          ${"workos-user-1"},
          ${false}
        )
      `,
    );

    await db`
      INSERT INTO users (
        id,
        household_id,
        email,
        name,
        is_drafted
      )
      VALUES (
        ${createId()},
        ${secondHouseholdId},
        ${"drafted@example.com"},
        ${"Drafted"},
        ${true}
      )
    `;
  });

  test("rejects orphan foreign-key references", async () => {
    await applyMigrations({ db });

    const context = await seedLedgerContext();

    await expectQueryToFail(
      db`
        INSERT INTO transactions (
          id,
          household_id,
          account_id,
          person_id,
          category_id,
          created_by_user_id,
          type,
          amount_minor,
          transaction_date
        )
        VALUES (
          ${createId()},
          ${context.householdId},
          ${createId()},
          ${context.personId},
          ${context.categoryId},
          ${context.userId},
          ${"expense"},
          ${500},
          ${"2026-04-05"}
        )
      `,
    );
  });

  test("rejects invalid transaction types and non-positive amounts", async () => {
    await applyMigrations({ db });

    const context = await seedLedgerContext();

    await expectQueryToFail(
      db`
        INSERT INTO transactions (
          id,
          household_id,
          account_id,
          person_id,
          category_id,
          created_by_user_id,
          type,
          amount_minor,
          transaction_date
        )
        VALUES (
          ${createId()},
          ${context.householdId},
          ${context.accountId},
          ${context.personId},
          ${context.categoryId},
          ${context.userId},
          ${"transfer"},
          ${500},
          ${"2026-04-05"}
        )
      `,
    );

    await expectQueryToFail(
      db`
        INSERT INTO transactions (
          id,
          household_id,
          account_id,
          person_id,
          category_id,
          created_by_user_id,
          type,
          amount_minor,
          transaction_date
        )
        VALUES (
          ${createId()},
          ${context.householdId},
          ${context.accountId},
          ${context.personId},
          ${context.categoryId},
          ${context.userId},
          ${"expense"},
          ${0},
          ${"2026-04-05"}
        )
      `,
    );
  });

  test("requires category and origin for manual transaction paths where appropriate", async () => {
    await applyMigrations({ db });

    const context = await seedLedgerContext();

    await expectQueryToFail(
      db`
        INSERT INTO transactions (
          id,
          household_id,
          account_id,
          person_id,
          created_by_user_id,
          type,
          amount_minor,
          transaction_date
        )
        VALUES (
          ${createId()},
          ${context.householdId},
          ${context.accountId},
          ${context.personId},
          ${context.userId},
          ${"expense"},
          ${550},
          ${"2026-04-05"}
        )
      `,
    );

    await expectQueryToFail(
      db`
        INSERT INTO transactions (
          id,
          household_id,
          account_id,
          person_id,
          category_id,
          created_by_user_id,
          type,
          amount_minor,
          transaction_date
        )
        VALUES (
          ${createId()},
          ${context.householdId},
          ${context.accountId},
          ${context.personId},
          ${context.categoryId},
          ${context.userId},
          ${"income"},
          ${1200},
          ${"2026-04-05"}
        )
      `,
    );

    await expectQueryToFail(
      db`
        INSERT INTO transactions (
          id,
          household_id,
          account_id,
          person_id,
          category_id,
          origin_id,
          created_by_user_id,
          type,
          amount_minor,
          transaction_date
        )
        VALUES (
          ${createId()},
          ${context.householdId},
          ${context.accountId},
          ${context.personId},
          ${context.categoryId},
          ${context.originId},
          ${context.userId},
          ${"expense"},
          ${1200},
          ${"2026-04-05"}
        )
      `,
    );
  });

  test("allows transfer-linked transactions to omit category and origin", async () => {
    await applyMigrations({ db });

    const context = await seedLedgerContext();
    const transferGroupId = createId();

    await db`
      INSERT INTO transactions (
        id,
        household_id,
        account_id,
        person_id,
        created_by_user_id,
        type,
        amount_minor,
        transaction_date,
        transfer_group_id
      )
      VALUES (
        ${createId()},
        ${context.householdId},
        ${context.accountId},
        ${context.personId},
        ${context.userId},
        ${"expense"},
        ${1500},
        ${"2026-04-05"},
        ${transferGroupId}
      )
    `;

    await db`
      INSERT INTO transactions (
        id,
        household_id,
        account_id,
        person_id,
        created_by_user_id,
        type,
        amount_minor,
        transaction_date,
        transfer_group_id
      )
      VALUES (
        ${createId()},
        ${context.householdId},
        ${context.accountId},
        ${context.personId},
        ${context.userId},
        ${"income"},
        ${1500},
        ${"2026-04-05"},
        ${transferGroupId}
      )
    `;

    const rows = (await db.unsafe(`
      SELECT type, category_id::text AS category_id, origin_id::text AS origin_id
      FROM transactions
      ORDER BY type ASC
    `)) as Array<{
      type: string;
      category_id: string | null;
      origin_id: string | null;
    }>;

    expect(rows).toEqual([
      {
        type: "expense",
        category_id: null,
        origin_id: null,
      },
      {
        type: "income",
        category_id: null,
        origin_id: null,
      },
    ]);
  });

  test("detects checksum drift for an already applied migration", async () => {
    const tempDirectory = await mkdtemp(
      join(tmpdir(), "finance-tracker-migrations-"),
    );

    try {
      const migrationPath = join(tempDirectory, "0001-temp.sql");

      await writeFile(migrationPath, "CREATE TABLE temp_one (id INTEGER);");
      await applyMigrations({ db, migrationsDirectory: tempDirectory });

      await writeFile(migrationPath, "CREATE TABLE temp_one (id BIGINT);");

      await expect(
        applyMigrations({ db, migrationsDirectory: tempDirectory }),
      ).rejects.toThrow("Migration checksum drift detected");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
