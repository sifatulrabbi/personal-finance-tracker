import { describe, expect, test } from "bun:test";
import { recentFirst, recentPicks, rememberPick, withPick } from "./recent";

const items = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("recent picks", () => {
  test("recently picked items come first, most recent first, the rest keep their order", () => {
    expect(recentFirst(items, ["c", "zz", "a"]).map((i) => i.id)).toEqual(["c", "a", "b", "d"]);
    expect(recentFirst(items, []).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  test("a pick moves to the front without repeating", () => {
    expect(withPick(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  test("without browser storage nothing breaks and nothing is remembered", () => {
    // bun test has no localStorage: reading and writing must not throw.
    rememberPick("wallet", "a");
    expect(recentPicks("wallet")).toEqual([]);
  });
});
