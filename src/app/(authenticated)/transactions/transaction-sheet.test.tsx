import { describe, expect, test } from "bun:test";

import { TransactionSheet } from "./transaction-sheet";

/**
 * Module-load smoke test. The full form requires several store providers and
 * a browser environment to render meaningfully — a proper interaction test
 * would need jsdom/happy-dom, which this repo doesn't yet have set up.
 *
 * What this catches:
 * - Syntax errors or broken imports in transaction-sheet.tsx
 * - Circular dependencies through the schema / form-helper / store layers
 * - Silent renames (e.g. a future refactor that drops the export)
 *
 * Field behaviour and validation are covered by:
 * - `src/libs/client/transaction-schemas.test.ts`
 * - `src/libs/client/transaction-form.test.ts`
 */
describe("TransactionSheet module", () => {
  test("exports a React function component", () => {
    expect(typeof TransactionSheet).toBe("function");
    expect(TransactionSheet.name).toBe("TransactionSheet");
  });
});
