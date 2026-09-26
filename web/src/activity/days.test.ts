import { describe, expect, test } from "bun:test";
import type { Transaction } from "@/api/types";
import { dhakaDate } from "@/lib/dates";
import { dayLabel, groupByDay, previousDay } from "./days";

function record(id: string, date: string): Transaction {
  return {
    id,
    kind: "expense",
    wallet_id: "w1",
    amount: "1.00",
    date,
    note: "",
    reason: "",
    version: 1,
    voided: false,
    bdt_amount: "1.00",
    actor_email: "a@example.test",
    created_at: `${date}T00:00:00Z`,
  };
}

describe("day labels", () => {
  test("today and yesterday are named, other days show the weekday", () => {
    expect(dayLabel("2026-09-26", "2026-09-26")).toBe("Today");
    expect(dayLabel("2026-09-25", "2026-09-26")).toBe("Yesterday");
    expect(dayLabel("2026-09-24", "2026-09-26")).toBe("Thu 24 Sep");
    expect(dayLabel("2025-12-31", "2026-09-26")).toBe("Wed 31 Dec 2025");
  });

  test("yesterday crosses month and year boundaries", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2024-03-01")).toBe("2024-02-29");
    expect(dayLabel("2025-12-31", "2026-01-01")).toBe("Yesterday");
  });

  test("a malformed date is shown as sent", () => {
    expect(dayLabel("someday", "2026-09-26")).toBe("someday");
  });
});

describe("grouping in Asia/Dhaka", () => {
  test("records of one date share a group, in list order", () => {
    const groups = groupByDay(
      [record("a", "2026-09-26"), record("b", "2026-09-26"), record("c", "2026-09-24")],
      "2026-09-26",
    );
    expect(groups.map((g) => [g.label, g.records.map((r) => r.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Thu 24 Sep", ["c"]],
    ]);
  });

  // 2026-09-25T20:30Z is already 26 September in Dhaka (UTC+6), while it is still the 25th
  // in UTC and in the Americas. "Today" must follow Dhaka, whatever the device zone.
  test("today follows the Dhaka calendar, not the device or UTC", () => {
    const lateEvening = new Date("2026-09-25T20:30:00Z");
    const today = dhakaDate(lateEvening);
    expect(today).toBe("2026-09-26");
    const groups = groupByDay([record("a", "2026-09-26"), record("b", "2026-09-25")], today);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
  });

  test("an empty list has no groups", () => {
    expect(groupByDay([], "2026-09-26")).toEqual([]);
  });
});
