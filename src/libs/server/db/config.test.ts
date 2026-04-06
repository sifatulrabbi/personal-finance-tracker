import { describe, expect, test } from "bun:test";

import { readDatabaseUrl, readTestDatabaseUrl } from "@/libs/server/db/config";

describe("database config", () => {
  test("reads DATABASE_URL when present", () => {
    expect(
      readDatabaseUrl({
        DATABASE_URL: "postgres://example/app",
      }),
    ).toBe("postgres://example/app");
  });

  test("throws clearly when DATABASE_URL is missing", () => {
    expect(() => readDatabaseUrl({})).toThrow(
      "DATABASE_URL is required to connect to the application database.",
    );
  });

  test("reads TEST_DATABASE_URL when present", () => {
    expect(
      readTestDatabaseUrl({
        TEST_DATABASE_URL: "postgres://example/test",
      }),
    ).toBe("postgres://example/test");
  });

  test("throws clearly when TEST_DATABASE_URL is missing", () => {
    expect(() => readTestDatabaseUrl({})).toThrow(
      "TEST_DATABASE_URL is required to connect to the integration test database.",
    );
  });
});
