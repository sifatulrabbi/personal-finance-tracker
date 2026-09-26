import { expect, test } from "bun:test";
import { pageForPath } from "./routes";

test("the page label matches the route the router renders", () => {
  expect(pageForPath("/wallets")?.name).toBe("Wallets");
  // The router ignores case and one trailing slash, so the label must too.
  expect(pageForPath("/Wallets")?.name).toBe("Wallets");
  expect(pageForPath("/wallets/")?.name).toBe("Wallets");
  expect(pageForPath("/monthly")?.name).toBe("Monthly spending");
});

test("unknown and nested paths have no page", () => {
  expect(pageForPath("/")).toBeUndefined();
  expect(pageForPath("/does-not-exist")).toBeUndefined();
  expect(pageForPath("/wallets/extra")).toBeUndefined();
});
