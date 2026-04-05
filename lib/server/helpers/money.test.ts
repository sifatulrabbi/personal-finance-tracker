import { describe, expect, test } from "bun:test";

import { fromMinorUnits, toMinorUnits } from "@/lib/server/helpers/money";

describe("money helpers", () => {
  test("converts decimal values into minor units", () => {
    expect(toMinorUnits("12.34")).toBe(1234);
    expect(toMinorUnits("12")).toBe(1200);
    expect(toMinorUnits("-9.99")).toBe(-999);
  });

  test("rejects values with more than two decimal places", () => {
    expect(() => toMinorUnits("1.234")).toThrow("Invalid money value");
  });

  test("converts minor units back into display strings", () => {
    expect(fromMinorUnits(1234)).toBe("12.34");
    expect(fromMinorUnits(-999)).toBe("-9.99");
  });
});
