import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTestDb, type BunSqlDatabase } from "@/lib/server/db/client";
import { applyMigrations } from "@/lib/server/db/migrations";

let db: BunSqlDatabase;

beforeAll(async () => {
  db = createTestDb();
  await db.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
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
      CREATE TABLE IF NOT EXISTS transaction_probe (
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
    await db.unsafe("TRUNCATE transaction_probe");

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
    await db.unsafe("DROP TABLE IF EXISTS schema_migrations");

    const firstRun = await applyMigrations({ db });
    const secondRun = await applyMigrations({ db });
    const rows = (await db.unsafe(`
      SELECT filename
      FROM schema_migrations
      ORDER BY filename ASC
    `)) as Array<{ filename: string }>;

    expect(firstRun.appliedMigrations).toEqual(["0001-enable-pgcrypto.sql"]);
    expect(secondRun.appliedMigrations).toEqual([]);
    expect(rows).toEqual([{ filename: "0001-enable-pgcrypto.sql" }]);
  });

  test("detects checksum drift for an already applied migration", async () => {
    const tempDirectory = await mkdtemp(
      join(tmpdir(), "finance-tracker-migrations-"),
    );

    try {
      const migrationPath = join(tempDirectory, "0001-temp.sql");

      await db.unsafe("DROP TABLE IF EXISTS schema_migrations");
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
