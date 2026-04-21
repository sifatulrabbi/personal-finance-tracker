import { createTestDb, getDb } from "@/libs/server/db/client";
import { applyMigrations } from "@/libs/server/db/migrations";

const useTestDatabase = Bun.argv.includes("--test");

const db = useTestDatabase ? createTestDb() : getDb();

try {
  const result = await applyMigrations({ db });

  console.log(
    JSON.stringify(
      {
        mode: useTestDatabase ? "test" : "app",
        appliedMigrations: result.appliedMigrations,
        skippedMigrations: result.skippedMigrations,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
