import { describe, expect, test } from "bun:test";

import { readDatabaseUrl, readTestDatabaseUrl } from "@/libs/server/db/config";

const CONFIG_ERROR =
  "Invalid server config: DATABASE_URL must be a valid Postgres connection URL.";
const TEST_CONFIG_ERROR =
  "Invalid server config: TEST_DATABASE_URL must be a valid Postgres connection URL.";

const VALID_WORKOS_ENV = {
  WORKOS_API_KEY: "sk_test_123",
  WORKOS_CLIENT_ID: "client_123",
  WORKOS_COOKIE_PASSWORD: "a".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3000/callback",
};

describe("database config", () => {
  test("reads DATABASE_URL when present", () => {
    expect(
      readDatabaseUrl({
        DATABASE_URL: "postgres://example/app",
        ...VALID_WORKOS_ENV,
      }),
    ).toBe("postgres://example/app");
  });

  test("does not require TEST_DATABASE_URL when reading DATABASE_URL", () => {
    expect(
      readDatabaseUrl({
        DATABASE_URL: "postgres://example/app",
        ...VALID_WORKOS_ENV,
      }),
    ).toBe("postgres://example/app");
  });

  test("throws clearly when DATABASE_URL is missing", () => {
    expect(() => readDatabaseUrl({})).toThrow(CONFIG_ERROR);
  });

  test("reads TEST_DATABASE_URL when present", () => {
    expect(
      readTestDatabaseUrl({
        TEST_DATABASE_URL: "postgres://example/test",
      }),
    ).toBe("postgres://example/test");
  });

  test("does not require DATABASE_URL when reading TEST_DATABASE_URL", () => {
    expect(
      readTestDatabaseUrl({
        TEST_DATABASE_URL: "postgres://example/test",
      }),
    ).toBe("postgres://example/test");
  });

  test("throws clearly when TEST_DATABASE_URL is missing", () => {
    expect(() => readTestDatabaseUrl({})).toThrow(TEST_CONFIG_ERROR);
  });
});
