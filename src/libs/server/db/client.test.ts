import { describe, expect, mock, test } from "bun:test";

import { createDatabaseManager } from "@/libs/server/db/client";

const VALID_WORKOS_ENV = {
  WORKOS_API_KEY: "sk_test_123",
  WORKOS_CLIENT_ID: "client_123",
  WORKOS_COOKIE_PASSWORD: "a".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3000/callback",
};

describe("database manager", () => {
  test("reuses one cached connection for repeated getDb calls", () => {
    const createConnection = mock((connectionString: string) => ({
      connectionString,
      close: async () => {},
    }));
    const manager = createDatabaseManager({
      env: {
        DATABASE_URL: "postgres://cached/app",
        ...VALID_WORKOS_ENV,
      },
      createConnection,
    });

    const first = manager.getDb();
    const second = manager.getDb();

    expect(first).toBe(second);
    expect(createConnection).toHaveBeenCalledTimes(1);
  });
});
