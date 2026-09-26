import { describe, expect, test } from "bun:test";
import {
  compact,
  filtersFromParams,
  hasFilters,
  listFilters,
  monthRange,
  paramsFromFilters,
  rangeLabel,
  type ActivityFilters,
} from "./filters";

const read = (query: string) => filtersFromParams(new URLSearchParams(query));

describe("filters and URL search params", () => {
  test("a round trip keeps every filter", () => {
    const filters: ActivityFilters = {
      kind: "expense",
      wallet: "w1",
      category: "expense-groceries",
      from: "2026-09-01",
      to: "2026-09-30",
    };
    expect(filtersFromParams(paramsFromFilters(filters))).toEqual(filters);
  });

  test("no params means no filters", () => {
    expect(read("")).toEqual({});
    expect(hasFilters(read(""))).toBe(false);
  });

  test("unknown kinds, malformed dates and odd ids are dropped", () => {
    expect(read("kind=opening&from=2026-02-31&to=soon&wallet=a%20b&category=<x>")).toEqual({});
  });

  test("a reversed date range is swapped", () => {
    expect(read("from=2026-09-30&to=2026-09-01")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  test("a transfer filter ignores a category, since transfers have none", () => {
    expect(read("kind=transfer&category=expense-groceries")).toEqual({ kind: "transfer" });
  });

  test("writing keeps unrelated params and removes cleared filters", () => {
    const params = paramsFromFilters({ kind: "income" }, new URLSearchParams("kind=expense&wallet=w1&tab=x"));
    expect(params.toString()).toBe("kind=income&tab=x");
  });

  test("compact drops empty values so equal filters look the same", () => {
    expect(compact({ kind: undefined, wallet: "", from: "2026-09-01" })).toEqual({ from: "2026-09-01" });
  });
});

describe("date ranges", () => {
  test("month ranges cover whole Dhaka months, across year ends and leap years", () => {
    expect(monthRange("2026-09-26")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2026-01-15", -1)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(monthRange("2024-03-31", -1)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  test("labels read naturally", () => {
    const today = "2026-09-26";
    expect(rangeLabel({}, today)).toBe("Any date");
    expect(rangeLabel({ from: "2026-09-01", to: "2026-09-30" }, today)).toBe("Sep 2026");
    expect(rangeLabel({ from: "2026-09-01", to: "2026-09-15" }, today)).toBe("1 Sep – 15 Sep");
    expect(rangeLabel({ from: "2025-12-24", to: "2025-12-24" }, today)).toBe("24 Dec 2025");
    expect(rangeLabel({ from: "2026-09-01" }, today)).toBe("From 1 Sep");
    expect(rangeLabel({ to: "2026-09-15" }, today)).toBe("Until 15 Sep");
  });
});

describe("listFilters", () => {
  test("always asks for voided records and maps names to the API", () => {
    expect(listFilters({})).toEqual({ include_voided: true });
    expect(listFilters({ kind: "transfer", wallet: "w1", category: "c", from: "2026-01-01", to: "2026-01-31" })).toEqual({
      include_voided: true,
      kind: "transfer",
      wallet_id: "w1",
      category_id: "c",
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });
});
