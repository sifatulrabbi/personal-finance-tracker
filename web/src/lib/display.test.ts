import { expect, test } from "bun:test";
import { mutationKey } from "@/api/idempotency";
import { moneyLabel } from "@/money/format";
import { dhakaDate, shortDate } from "./dates";

test("retries reuse the key only for the same financial request", () => {
  const first = mutationKey(undefined, "/transactions", { amount: "10" });
  expect(mutationKey(first, "/transactions", { amount: "10" }).key).toBe(first.key);
  expect(mutationKey(first, "/transactions", { amount: "20" }).key).not.toBe(first.key);
  expect(mutationKey(first, "/wallets", { amount: "10" }).key).not.toBe(first.key);
});

test("money presentation preserves every decimal digit", () => {
  expect(moneyLabel("90000000000.01", "BDT")).toBe("৳90,000,000,000.01");
  expect(moneyLabel("-12.50", "USD")).toBe("−$12.50");
});

test("transaction defaults use the Dhaka calendar date", () => {
  expect(dhakaDate(new Date("2026-09-14T20:00:00Z"))).toBe("2026-09-15");
  expect(dhakaDate(new Date("2026-09-30T17:59:59Z"))).toBe("2026-09-30");
  expect(dhakaDate(new Date("2026-09-30T18:00:00Z"))).toBe("2026-10-01");
});

test("list dates read as Today, Yesterday, or a short day and month", () => {
  const today = "2026-03-01";
  expect(shortDate("2026-03-01", today)).toBe("Today");
  // Across a month boundary; 2026 is not a leap year.
  expect(shortDate("2026-02-28", today)).toBe("Yesterday");
  expect(shortDate("2026-02-27", today)).toBe("27 Feb");
  expect(shortDate("2025-12-31", today)).toBe("31 Dec 2025");
  expect(shortDate("2025-12-31", "2026-01-01")).toBe("Yesterday");
  expect(shortDate("not a date", today)).toBe("not a date");
});
