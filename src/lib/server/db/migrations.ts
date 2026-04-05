import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { BunSqlDatabase } from "@/lib/server/db/client";
import { createMigrationRepository } from "@/lib/server/db/migration-repository";

export const MIGRATIONS_DIRECTORY = join(
  process.cwd(),
  "src",
  "db",
  "migrations",
);

export type MigrationFile = {
  filename: string;
  checksum: string;
  sql: string;
};

export type MigrationRunResult = {
  appliedMigrations: string[];
  skippedMigrations: string[];
};

export async function loadMigrationFiles(
  migrationsDirectory = MIGRATIONS_DIRECTORY,
): Promise<MigrationFile[]> {
  const directoryEntries = await readdir(migrationsDirectory, {
    withFileTypes: true,
  });

  const migrationNames = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    migrationNames.map(async (filename) => {
      const sql = await readFile(join(migrationsDirectory, filename), "utf8");

      return {
        filename,
        checksum: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
  );
}

export async function applyMigrations({
  db,
  migrationsDirectory = MIGRATIONS_DIRECTORY,
}: {
  db: BunSqlDatabase;
  migrationsDirectory?: string;
}): Promise<MigrationRunResult> {
  const migrationRepository = createMigrationRepository({ db });

  await migrationRepository.ensureMigrationTable();

  const [migrationFiles, appliedMigrations] = await Promise.all([
    loadMigrationFiles(migrationsDirectory),
    migrationRepository.listAppliedMigrations(),
  ]);

  const appliedByFilename = new Map(
    appliedMigrations.map((migration) => [migration.filename, migration]),
  );

  const result: MigrationRunResult = {
    appliedMigrations: [],
    skippedMigrations: [],
  };

  for (const migrationFile of migrationFiles) {
    const appliedMigration = appliedByFilename.get(migrationFile.filename);

    if (appliedMigration) {
      if (appliedMigration.checksum !== migrationFile.checksum) {
        throw new Error(
          `Migration checksum drift detected for ${migrationFile.filename}.`,
        );
      }

      result.skippedMigrations.push(migrationFile.filename);
      continue;
    }

    await db.begin(async (transactionDb: BunSqlDatabase) => {
      const transactionRepository = createMigrationRepository({
        db: transactionDb as BunSqlDatabase,
      });

      await transactionDb.unsafe(migrationFile.sql);
      await transactionRepository.recordAppliedMigration({
        filename: migrationFile.filename,
        checksum: migrationFile.checksum,
      });
    });

    result.appliedMigrations.push(migrationFile.filename);
  }

  return result;
}
