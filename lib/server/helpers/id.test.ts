import { describe, expect, test } from "bun:test";

import { generateId } from "@/lib/server/helpers/id";

describe("id helpers", () => {
  test("creates UUIDs", () => {
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
