import { describe, expect, test } from "bun:test";
import {
  directionForKind,
  formatMoney,
  isNegative,
  rateLabel,
  isZero,
  moneyLabel,
  moneyTone,
} from "./format";

describe("formatMoney", () => {
  test("groups thousands and keeps every fraction digit the server sent", () => {
    expect(formatMoney("90000000000.01", "BDT")).toBe("৳90,000,000,000.01");
    expect(formatMoney("1234.5", "BDT")).toBe("৳1,234.50");
    expect(formatMoney("7", "BDT")).toBe("৳7.00");
    expect(formatMoney("0.123456", "BDT")).toBe("৳0.123456");
    expect(formatMoney("999", "BDT")).toBe("৳999.00");
    expect(formatMoney("1000", "BDT")).toBe("৳1,000.00");
  });

  test("uses ৳ for BDT and $ for USD", () => {
    expect(formatMoney("250", "USD")).toBe("$250.00");
    expect(formatMoney("250", "BDT")).toBe("৳250.00");
  });

  test("puts the sign before the currency symbol, with a real minus sign", () => {
    expect(formatMoney("-150", "BDT")).toBe("−৳150.00");
    expect(formatMoney("-12.50", "USD")).toBe("−$12.50");
  });

  test("income is plus, expense is minus, a transfer has no sign", () => {
    expect(formatMoney("100", "BDT", "in")).toBe("+৳100.00");
    expect(formatMoney("100", "BDT", "out")).toBe("−৳100.00");
    expect(formatMoney("100", "BDT", "transfer")).toBe("৳100.00");
  });

  test("a negative expense reads as money coming back, never as a double minus", () => {
    expect(formatMoney("-20", "BDT", "out")).toBe("+৳20.00");
    expect(formatMoney("-20", "BDT", "in")).toBe("−৳20.00");
  });

  test("zero is never shown with a minus", () => {
    expect(formatMoney("-0.00", "BDT")).toBe("৳0.00");
    expect(formatMoney("0", "BDT")).toBe("৳0.00");
  });

  test("leading zeros in the whole part are dropped", () => {
    expect(formatMoney("0007.5", "BDT")).toBe("৳7.50");
  });

  test("moneyLabel is the plain balance format", () => {
    expect(moneyLabel("-16179", "BDT")).toBe("−৳16,179.00");
    expect(moneyLabel("321.45", "BDT")).toBe("৳321.45");
  });
});

describe("sign helpers", () => {
  test("negative and zero detection work on strings", () => {
    expect(isNegative("-1")).toBe(true);
    expect(isNegative("-0.00")).toBe(false);
    expect(isNegative("12")).toBe(false);
    expect(isZero("0.00")).toBe(true);
    expect(isZero("-0")).toBe(true);
    expect(isZero("0.01")).toBe(false);
  });
});

describe("moneyTone", () => {
  test("each direction has its own color role", () => {
    expect(moneyTone("10", "in")).toBe("income");
    expect(moneyTone("10", "out")).toBe("expense");
    expect(moneyTone("10", "transfer")).toBe("transfer");
    expect(moneyTone("10", "balance")).toBe("neutral");
  });

  test("a negative cash balance is flagged, a positive one is not", () => {
    expect(moneyTone("-16179", "balance")).toBe("negative");
    expect(moneyTone("16179", "balance")).toBe("neutral");
  });

  test("card debt has the debt role unless nothing is owed", () => {
    expect(moneyTone("3400", "balance", true)).toBe("debt");
    expect(moneyTone("0.00", "balance", true)).toBe("neutral");
  });
});

describe("directionForKind", () => {
  test("opening balances and adjustments are balance changes, not income or spending", () => {
    expect(directionForKind("income")).toBe("in");
    expect(directionForKind("expense")).toBe("out");
    expect(directionForKind("transfer")).toBe("transfer");
    expect(directionForKind("opening")).toBe("balance");
    expect(directionForKind("adjustment")).toBe("balance");
  });
});

test("rates drop the stored zero padding but keep every real digit", () => {
  expect(rateLabel("122.500000")).toBe("122.50");
  expect(rateLabel("125")).toBe("125.00");
  expect(rateLabel("123.456789")).toBe("123.456789");
});
