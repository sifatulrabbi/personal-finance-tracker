import { expect, test } from "bun:test";
import { mutationKey } from "@/api/idempotency";
import { moneyLabel } from "@/money/format";
import {
  daysBetween,
  dhakaDate,
  dhakaDateTime,
  dueLabel,
  monthLabel,
  shiftMonth,
  shortDate,
} from "./dates";

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

test("due labels count Dhaka calendar days, across months and leap years", () => {
  expect(dueLabel("2026-07-05", "2026-09-26")).toEqual({ text: "83 days overdue", tone: "overdue" });
  expect(dueLabel("2026-09-25", "2026-09-26")).toEqual({ text: "1 day overdue", tone: "overdue" });
  expect(dueLabel("2026-09-26", "2026-09-26")).toEqual({ text: "Due today", tone: "today" });
  expect(dueLabel("2026-09-27", "2026-09-26").text).toBe("Due tomorrow");
  expect(dueLabel("2026-10-01", "2026-09-26").text).toBe("Due in 5 days");
  expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
});

test("months read as names and step across years", () => {
  expect(monthLabel("2026-09")).toBe("September 2026");
  expect(monthLabel("bad")).toBe("bad");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  expect(shiftMonth("2026-09", -21)).toBe("2024-12");
});

test("stored instants show as Asia/Dhaka date and time", () => {
  // 18:00 UTC is midnight in Dhaka (UTC+6), the next calendar day.
  expect(dhakaDateTime("2026-09-30T18:00:00.000000000Z")).toBe("1 Oct 2026, 12:00 AM");
  expect(dhakaDateTime("2026-10-02T09:41:00Z")).toBe("2 Oct 2026, 3:41 PM");
  expect(dhakaDateTime("not a time")).toBe("not a time");
});
