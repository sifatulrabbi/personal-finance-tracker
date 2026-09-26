import { expect, test } from "bun:test";
import { homePath, pageForPath, routeForPath, walletPath } from "./routes";

test("the page label matches the route the router renders", () => {
  expect(pageForPath("/wallets")?.name).toBe("Wallets");
  // The router ignores case and one trailing slash, so the label must too.
  expect(pageForPath("/Wallets")?.name).toBe("Wallets");
  expect(pageForPath("/wallets/")?.name).toBe("Wallets");
  expect(pageForPath("/monthly")?.name).toBe("Monthly spending");
  expect(pageForPath("/home")?.name).toBe("Home");
});

test("Home is where sign-in and / land", () => {
  expect(homePath).toBe("/home");
});

test("unknown and nested paths have no page", () => {
  expect(pageForPath("/")).toBeUndefined();
  expect(pageForPath("/does-not-exist")).toBeUndefined();
  expect(pageForPath("/wallets/extra")).toBeUndefined();
});

test("a wallet detail URL belongs to Wallets and carries the wallet id", () => {
  expect(routeForPath("/wallets/abc123")).toEqual({
    page: { name: "Wallets", path: "/wallets" },
    walletID: "abc123",
  });
  expect(routeForPath("/wallets/abc123/")?.walletID).toBe("abc123");
  expect(routeForPath(walletPath("a b"))?.walletID).toBe("a b");
  expect(routeForPath("/wallets")).toEqual({ page: { name: "Wallets", path: "/wallets" } });
  expect(routeForPath("/wallets/a/b")).toBeUndefined();
  expect(routeForPath("/bills/abc")).toBeUndefined();
});
