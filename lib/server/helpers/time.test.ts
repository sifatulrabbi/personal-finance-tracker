import { describe, expect, test } from "bun:test";

import { getUtcTimestamp } from "@/lib/server/helpers/time";

describe("time helpers", () => {
  test("formats UTC timestamps as ISO strings", () => {
    expect(getUtcTimestamp(new Date("2026-04-04T10:30:00.000Z"))).toBe(
      "2026-04-04T10:30:00.000Z",
    );
  });
});
