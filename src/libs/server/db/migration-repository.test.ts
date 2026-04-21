import { describe, expect, mock, test } from "bun:test";

import { createMigrationRepository } from "@/libs/server/db/migration-repository";
import type { BunSqlDatabase } from "@/libs/server/db/client";

function createDbStub() {
  const query = mock(async () => []);
  const unsafe = mock(async () => []);

  return Object.assign(query, {
    unsafe,
  }) as unknown as BunSqlDatabase;
}

describe("createMigrationRepository", () => {
  test("ensures the schema_migrations table through the provided db", async () => {
    const db = createDbStub();
    const repository = createMigrationRepository({ db });

    await repository.ensureMigrationTable();

    expect(db.unsafe).toHaveBeenCalledTimes(1);
  });

  test("records a migration through the provided db", async () => {
    const db = createDbStub();
    const repository = createMigrationRepository({ db });

    await repository.recordAppliedMigration({
      filename: "0001-example.sql",
      checksum: "checksum",
    });

    expect(db).toHaveBeenCalledTimes(1);
  });
});
