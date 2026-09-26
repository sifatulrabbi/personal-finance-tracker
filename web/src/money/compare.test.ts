import { expect, test } from "bun:test";
import { compareDecimal, fillPercent, subtractDecimal } from "./compare";

test("comparisons are exact at any size and fraction length", () => {
  expect(compareDecimal("62268.00", "60000.00")).toBe(1);
  expect(compareDecimal("60000", "60000.00")).toBe(0);
  expect(compareDecimal("0.1", "0.10")).toBe(0);
  expect(compareDecimal("-5.00", "0.00")).toBe(-1);
  // Past 2^53, where a float would call these equal.
  expect(compareDecimal("90071992547409.93", "90071992547409.92")).toBe(1);
});

test("a difference keeps every digit and its sign", () => {
  expect(subtractDecimal("62268.00", "60000.00")).toBe("2268.00");
  expect(subtractDecimal("60000.00", "62268.50")).toBe("-2268.50");
  expect(subtractDecimal("0.30", "0.10")).toBe("0.20");
  expect(subtractDecimal("5", "5.00")).toBe("0.00");
  expect(subtractDecimal("90071992547409.93", "0.01")).toBe("90071992547409.92");
});

test("a progress bar fills by whole percent and stops at full", () => {
  expect(fillPercent("30000.00", "60000.00")).toBe(50);
  expect(fillPercent("62268.00", "60000.00")).toBe(100);
  expect(fillPercent("0.00", "60000.00")).toBe(0);
  expect(fillPercent("0.01", "60000.00")).toBe(1);
  // No target, or an overpaid card with negative debt, fills nothing.
  expect(fillPercent("100.00", "0.00")).toBe(0);
  expect(fillPercent("-150.00", "5000.00")).toBe(0);
});

test("malformed input is an error, never a silent zero", () => {
  expect(() => compareDecimal("1,000", "1")).toThrow();
  expect(() => subtractDecimal("", "1")).toThrow();
});
