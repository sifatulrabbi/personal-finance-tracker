import { createTestDb, getDb } from "@/libs/server/db/client";
import { seedDatabase } from "@/libs/server/db/seed";

const useTestDatabase = Bun.argv.includes("--test");

const db = useTestDatabase ? createTestDb() : getDb();

try {
  const result = await seedDatabase({ db });
  const insertedRecords = result.records.filter(
    (record) => record.action === "inserted",
  ).length;

  console.log(
    JSON.stringify(
      {
        mode: useTestDatabase ? "test" : "app",
        insertedRecords,
        skippedRecords: result.records.length - insertedRecords,
        records: result.records,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
