import { expect, test } from "bun:test";
import { mutationKey, moneyLabel, dhakaDate } from "./api";

test("retries reuse the key only for the same financial request", () => {
  const first = mutationKey(undefined, "/transactions", { amount: "10" });
  expect(mutationKey(first, "/transactions", { amount: "10" }).key).toBe(
    first.key,
  );
  expect(mutationKey(first, "/transactions", { amount: "20" }).key).not.toBe(
    first.key,
  );
  expect(mutationKey(first, "/wallets", { amount: "10" }).key).not.toBe(
    first.key,
  );
});

test("money presentation preserves every decimal digit", () => {
  expect(moneyLabel("90000000000.01", "BDT")).toBe("৳90,000,000,000.01");
  expect(moneyLabel("-12.50", "USD")).toBe("US$−12.50");
});

test("transaction defaults use the Dhaka calendar date", () => {
  expect(dhakaDate(new Date("2026-09-14T20:00:00Z"))).toBe("2026-09-15");
});
