import { expect, test } from "bun:test";
import { mutationKey, randomKey } from "./idempotency";

// Regression: crypto.randomUUID is missing over plain HTTP, which made every save throw.
test("a key is still made when randomUUID is unavailable", () => {
  const source = { getRandomValues: crypto.getRandomValues.bind(crypto) } as Pick<
    Crypto,
    "getRandomValues"
  >;
  const keys = new Set(Array.from({ length: 200 }, () => randomKey(source)));
  expect(keys.size).toBe(200);
  for (const key of keys)
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("randomUUID is used when the browser offers it", () => {
  const source = {
    getRandomValues: crypto.getRandomValues.bind(crypto),
    randomUUID: () => "from-browser",
  };
  expect(randomKey(source as never)).toBe("from-browser");
});

test("an identical retry reuses its key and a changed body gets a new one", () => {
  const first = mutationKey(undefined, "POST /x", { a: 1 });
  expect(mutationKey(first, "POST /x", { a: 1 })).toBe(first);
  expect(mutationKey(first, "POST /x", { a: 2 }).key).not.toBe(first.key);
});
