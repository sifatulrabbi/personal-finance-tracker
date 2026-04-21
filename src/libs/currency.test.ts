import { describe, expect, test } from "bun:test";

import {
  BASE_CURRENCY_CODE,
  BASE_CURRENCY_RATE,
  convertToBdt,
  isBdt,
} from "./currency";

describe("convertToBdt", () => {
  test("BDT to BDT is identity", () => {
    expect(convertToBdt(5000, BASE_CURRENCY_RATE)).toBe(5000);
  });

  test("converts USD to BDT", () => {
    // 9.99 USD (999 minor) at rate 122.00 (12200 minor)
    // 999 * 12200 / 100 = 121,878
    expect(convertToBdt(999, 12200)).toBe(121878);
  });

  test("converts EUR to BDT", () => {
    // 10.00 EUR (1000 minor) at rate 143.00 (14300 minor)
    // 1000 * 14300 / 100 = 143000
    expect(convertToBdt(1000, 14300)).toBe(143000);
  });

  test("rounds half-up correctly", () => {
    // 1 minor at rate 150 (1.50 BDT per unit)
    // 1 * 150 / 100 = 1.5 → rounds to 2
    expect(convertToBdt(1, 150)).toBe(2);
  });

  test("handles zero amount", () => {
    expect(convertToBdt(0, 12050)).toBe(0);
  });

  test("handles large amounts within safe integer range", () => {
    // 1,000,000.00 USD (100_000_000 minor) at rate 120.50
    const result = convertToBdt(100_000_000, 12050);
    expect(result).toBe(12_050_000_000);
  });
});

describe("isBdt", () => {
  test("returns true for BDT", () => {
    expect(isBdt("BDT")).toBe(true);
  });

  test("returns false for USD", () => {
    expect(isBdt("USD")).toBe(false);
  });

  test("returns false for lowercase bdt", () => {
    expect(isBdt("bdt")).toBe(false);
  });
});

describe("constants", () => {
  test("BASE_CURRENCY_CODE is BDT", () => {
    expect(BASE_CURRENCY_CODE).toBe("BDT");
  });

  test("BASE_CURRENCY_RATE is 100", () => {
    expect(BASE_CURRENCY_RATE).toBe(100);
  });
});
