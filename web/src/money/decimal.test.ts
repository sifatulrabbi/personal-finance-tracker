import { describe, expect, test } from "bun:test";
import { parseDecimalInput } from "./decimal";

const valid = (text: string, options?: Parameters<typeof parseDecimalInput>[1]) => {
  const result = parseDecimalInput(text, options);
  if (result.kind !== "valid") throw new Error(`${text} was ${result.kind}`);
  return result.value;
};
const kind = (text: string, options?: Parameters<typeof parseDecimalInput>[1]) =>
  parseDecimalInput(text, options).kind;

describe("parseDecimalInput", () => {
  test("accepts plain and grouped decimals and keeps every digit", () => {
    expect(valid("125.50")).toBe("125.50");
    expect(valid("1,020.50")).toBe("1020.50");
    expect(valid("90,000,000,000.01")).toBe("90000000000.01");
    expect(valid(" 42 ")).toBe("42");
    expect(valid(".5")).toBe("0.5");
    expect(valid("5.")).toBe("5");
    expect(valid("007.10")).toBe("7.10");
    expect(valid("0")).toBe("0");
  });

  test("empty and whitespace-only text is empty, not zero", () => {
    expect(kind("")).toBe("empty");
    expect(kind("   ")).toBe("empty");
  });

  // Regression: with type="number", "1020,50" read as "" on WebKit, so a bill payment was
  // silently recorded at the scheduled amount. It must be a visible error instead.
  test("a comma decimal is an error with a hint, never empty", () => {
    const result = parseDecimalInput("1020,50");
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.message).toContain("dot for decimals");
  });

  test("rejects symbols, exponents, signs, and stray text", () => {
    for (const text of ["৳1,020", "1e3", "+5", "12a", "1.2.3", "1 000", "-", ".", ",", "1,00"])
      expect(kind(text)).toBe("invalid");
  });

  test("limits decimal places per field", () => {
    expect(kind("1.005")).toBe("invalid");
    expect(valid("125.123456", { maxFraction: 6 })).toBe("125.123456");
    expect(kind("125.1234567", { maxFraction: 6 })).toBe("invalid");
  });

  test("negative values only where the field allows them", () => {
    expect(kind("-150")).toBe("invalid");
    expect(valid("-150.25", { allowNegative: true })).toBe("-150.25");
    expect(valid("−150", { allowNegative: true })).toBe("-150");
    expect(valid("-0.00", { allowNegative: true })).toBe("0.00");
  });

  test("overlong input is rejected", () => {
    expect(kind("1".repeat(41))).toBe("invalid");
  });

  // Fuzz: any well-formed decimal string round-trips unchanged (after grouping and leading
  // zeros are removed), so no digit is ever lost or rounded.
  test("random well-formed decimals round-trip exactly", () => {
    let seed = 20260926;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const digits = (length: number) =>
      Array.from({ length }, () => String(random(10))).join("");
    for (let i = 0; i < 2000; i++) {
      const whole = String(BigInt(`1${digits(random(15))}`) - 1n).replace(/^0+(?=\d)/, "");
      const fraction = digits(random(3));
      const negative = random(2) === 1;
      const canonical = `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
      const grouped = `${negative ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
      const expected = /^-0(\.0*)?$/.test(canonical) ? canonical.slice(1) : canonical;
      expect(valid(canonical, { allowNegative: true })).toBe(expected);
      expect(valid(grouped, { allowNegative: true })).toBe(expected);
    }
  });
});
