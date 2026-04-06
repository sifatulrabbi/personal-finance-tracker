import { afterEach, describe, expect, test } from "bun:test";

import {
  createAppConfig,
  createTestAppConfig,
  getAppConfig,
  resetAppConfigForTests,
} from "@/libs/server/config";

const CONFIG_ERROR =
  "Invalid server config: DATABASE_URL must be a valid Postgres connection URL.";
const TEST_CONFIG_ERROR =
  "Invalid server config: TEST_DATABASE_URL must be a valid Postgres connection URL.";

const originalDatabaseUrl = process.env.DATABASE_URL;

function setDatabaseUrl(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }

  process.env.DATABASE_URL = value;
}

afterEach(() => {
  resetAppConfigForTests();
  setDatabaseUrl(originalDatabaseUrl);
});

describe("server config", () => {
  test("creates runtime app config from DATABASE_URL", () => {
    expect(
      createAppConfig({
        env: {
          DATABASE_URL: "postgres://example/app",
        },
      }),
    ).toEqual({
      database: {
        url: "postgres://example/app",
      },
    });
  });

  test("does not require TEST_DATABASE_URL for runtime app config", () => {
    expect(
      createAppConfig({
        env: {
          DATABASE_URL: "postgresql://example/app",
        },
      }),
    ).toEqual({
      database: {
        url: "postgresql://example/app",
      },
    });
  });

  test("throws clearly when DATABASE_URL is missing", () => {
    expect(() => createAppConfig({ env: {} })).toThrow(CONFIG_ERROR);
  });

  test("throws clearly when DATABASE_URL is empty", () => {
    expect(() =>
      createAppConfig({
        env: {
          DATABASE_URL: "   ",
        },
      }),
    ).toThrow(CONFIG_ERROR);
  });

  test("throws clearly when DATABASE_URL is not a Postgres URL", () => {
    expect(() =>
      createAppConfig({
        env: {
          DATABASE_URL: "https://example/app",
        },
      }),
    ).toThrow(CONFIG_ERROR);
  });

  test("creates test app config from TEST_DATABASE_URL", () => {
    expect(
      createTestAppConfig({
        env: {
          TEST_DATABASE_URL: "postgres://example/test",
        },
      }),
    ).toEqual({
      database: {
        url: "postgres://example/test",
      },
    });
  });

  test("does not require DATABASE_URL for test app config", () => {
    expect(
      createTestAppConfig({
        env: {
          TEST_DATABASE_URL: "postgresql://example/test",
        },
      }),
    ).toEqual({
      database: {
        url: "postgresql://example/test",
      },
    });
  });

  test("throws clearly when TEST_DATABASE_URL is missing", () => {
    expect(() => createTestAppConfig({ env: {} })).toThrow(TEST_CONFIG_ERROR);
  });

  test("caches runtime app config after the first getAppConfig call", () => {
    setDatabaseUrl("postgres://example/first");

    const firstConfig = getAppConfig();

    setDatabaseUrl("postgres://example/second");

    const secondConfig = getAppConfig();

    expect(secondConfig).toBe(firstConfig);
    expect(secondConfig.database.url).toBe("postgres://example/first");
  });

  test("resets the cached runtime app config for tests", () => {
    setDatabaseUrl("postgres://example/first");

    const firstConfig = getAppConfig();

    resetAppConfigForTests();
    setDatabaseUrl("postgres://example/second");

    const secondConfig = getAppConfig();

    expect(secondConfig).not.toBe(firstConfig);
    expect(secondConfig.database.url).toBe("postgres://example/second");
  });
});
