import { describe, expect, test } from "bun:test";

import { createId, formatUlidAsUuid } from "@/libs/id";

describe("id module", () => {
  test("creates unique UUID-compatible IDs", () => {
    const first = createId();
    const second = createId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(second).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(first).not.toBe(second);
  });

  test("formats a known ULID deterministically", () => {
    expect(formatUlidAsUuid("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(
      "01563e3a-b5d3-d676-4c61-efb99302bd5b",
    );
  });

  test("rejects invalid ULIDs", () => {
    expect(() => formatUlidAsUuid("not-a-ulid")).toThrow("Invalid ULID");
  });
});
