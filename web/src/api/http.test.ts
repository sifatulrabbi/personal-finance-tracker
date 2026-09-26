import { expect, test } from "bun:test";
import { createHttpClient } from "./http";
import { ApiError } from "./errors";

type Seen = { url: string; init: RequestInit };

function recordingFetch(respond: (seen: Seen) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const entry = { url, init };
    seen.push(entry);
    return respond(entry);
  };
  return { seen, fetch };
}

test("writes send CSRF, JSON, and the idempotency key", async () => {
  const { seen, fetch } = recordingFetch(
    () => new Response(JSON.stringify({ id: "t1" }), { status: 200 }),
  );
  const api = createHttpClient({ fetch });
  const record = await api.createTransaction(
    { kind: "expense", wallet_id: "w1", amount: "10.00", date: "2026-09-14", note: "" },
    { key: "key-1" },
  );
  expect(record.id).toBe("t1");
  expect(seen[0].url).toBe("/api/v1/transactions");
  expect(seen[0].init.method).toBe("POST");
  const headers = seen[0].init.headers as Record<string, string>;
  expect(headers["X-CSRF-Protection"]).toBe("1");
  expect(headers["Idempotency-Key"]).toBe("key-1");
  expect(JSON.parse(String(seen[0].init.body)).amount).toBe("10.00");
});

test("reads send no idempotency key and encode path and query values", async () => {
  const { seen, fetch } = recordingFetch(() => new Response("[]"));
  const api = createHttpClient({ fetch });
  await api.transactions({ limit: 50, offset: 100 });
  await api.monthly("2026-09");
  await api.history("a/b");
  expect(seen.map((s) => s.url)).toEqual([
    "/api/v1/transactions?limit=50&offset=100",
    "/api/v1/monthly?month=2026-09",
    "/api/v1/transactions/a%2Fb/history",
  ]);
  const headers = seen[0].init.headers as Record<string, string>;
  expect(headers["Idempotency-Key"]).toBeUndefined();
});

test("a failed response becomes an ApiError with the server's message", async () => {
  const { fetch } = recordingFetch(
    () =>
      new Response(
        JSON.stringify({ error: { code: "archived_wallet", message: "That wallet is archived." } }),
        { status: 400 },
      ),
  );
  const api = createHttpClient({ fetch });
  const error = await api.wallets().catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe("archived_wallet");
  expect(error.message).toBe("That wallet is archived.");
});

test("a rejected fetch becomes a network error, not a sign-out", async () => {
  const api = createHttpClient({
    fetch: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  const error = await api.me().catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.network).toBe(true);
  expect(error.unauthenticated).toBe(false);
});

// Regression: fetch had no timeout, so a stalled request kept "Saving…" forever.
test("a stalled request times out as a network error", async () => {
  const api = createHttpClient({
    timeoutMs: 20,
    fetch: (_, init) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted"))),
      ),
  });
  const error = await api.settings().catch((e) => e);
  expect(error.network).toBe(true);
  expect(error.message).toContain("too long");
});

test("logout resolves on success with any body", async () => {
  const { fetch } = recordingFetch(() => new Response('{"ok":true}'));
  await expect(createHttpClient({ fetch }).logout()).resolves.toBeUndefined();
});
