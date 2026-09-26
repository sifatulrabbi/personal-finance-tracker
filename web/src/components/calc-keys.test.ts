import { describe, expect, test } from "bun:test";
import { editAtCaret } from "./calc-amount-input";

describe("operator keys edit at the caret", () => {
  test("insert at the caret, not at the end", () => {
    expect(editAtCaret("12045", 3, 3, "+")).toEqual({ value: "120+45", caret: 4 });
  });
  test("replace a selection", () => {
    expect(editAtCaret("120+45", 3, 4, "×")).toEqual({ value: "120×45", caret: 4 });
  });
  test("delete the character before the caret or the selection", () => {
    expect(editAtCaret("120+45", 4, 4, null)).toEqual({ value: "12045", caret: 3 });
    expect(editAtCaret("120+45", 1, 3, null)).toEqual({ value: "1+45", caret: 1 });
    expect(editAtCaret("120", 0, 0, null)).toEqual({ value: "120", caret: 0 });
  });
});
