import { describe, expect, mock, test } from "bun:test";

import { createDatabaseManager } from "@/lib/server/db/client";

describe("database manager", () => {
  test("reuses one cached connection for repeated getDb calls", () => {
    const createConnection = mock((connectionString: string) => ({
      connectionString,
      close: async () => {},
    }));
    const manager = createDatabaseManager({
      env: {
        DATABASE_URL: "postgres://cached/app",
      },
      createConnection,
    });

    const first = manager.getDb();
    const second = manager.getDb();

    expect(first).toBe(second);
    expect(createConnection).toHaveBeenCalledTimes(1);
  });
});
