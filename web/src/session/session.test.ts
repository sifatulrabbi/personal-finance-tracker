import { describe, expect, test } from "bun:test";
import { createFakeClient } from "@/api/fake";
import { ApiError, errorFromBody, networkError } from "@/api/errors";
import { guardSession } from "./guard";
import { initialSession, sessionReducer, type SessionState } from "./state";

const user = { id: "u1", email: "a@example.test", name: "A" };
const signedIn: SessionState = { status: "signedIn", user, expired: false };

describe("sessionReducer", () => {
  test("startup outcomes: signed in, signed out, or unreachable", () => {
    expect(sessionReducer(initialSession, { type: "checked", user })).toEqual(signedIn);
    expect(sessionReducer(initialSession, { type: "checkedSignedOut" })).toEqual({ status: "signedOut" });
    // Regression: an unreachable server used to show the login form.
    expect(sessionReducer(initialSession, { type: "checkFailed", message: "down" })).toEqual({
      status: "unreachable",
      message: "down",
    });
    expect(sessionReducer({ status: "unreachable", message: "down" }, { type: "retry" })).toEqual(initialSession);
  });

  // Regression: a 401 during use dropped the user and unmounted the open form.
  test("a 401 while signed in keeps the user and marks the session expired", () => {
    const expired = sessionReducer(signedIn, { type: "expired" });
    expect(expired).toEqual({ status: "signedIn", user, expired: true });
    expect(sessionReducer(expired, { type: "signedIn", user })).toEqual(signedIn);
  });

  test("expiry means nothing when not signed in", () => {
    const out: SessionState = { status: "signedOut" };
    expect(sessionReducer(out, { type: "expired" })).toBe(out);
  });
});

describe("guardSession", () => {
  test("a 401 from a data call reports expiry and still rejects for the form", async () => {
    let expired = 0;
    const fake = createFakeClient({
      createTransaction: async () => Promise.reject(errorFromBody(401, "")),
    });
    const api = guardSession(fake.client, () => expired++);
    const error = await api
      .createTransaction({ kind: "expense", wallet_id: "w", amount: "1", date: "2026-09-26", note: "" }, { key: "k" })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(expired).toBe(1);
  });

  test("other failures do not expire the session", async () => {
    let expired = 0;
    const fake = createFakeClient({
      wallets: async () => Promise.reject(networkError()),
      settings: async () => Promise.reject(errorFromBody(409, "")),
    });
    const api = guardSession(fake.client, () => expired++);
    await api.wallets().catch(() => {});
    await api.settings().catch(() => {});
    expect(expired).toBe(0);
  });

  test("session calls handle their own 401s", async () => {
    let expired = 0;
    const fake = createFakeClient({
      me: async () => Promise.reject(errorFromBody(401, "")),
      login: async () => Promise.reject(errorFromBody(401, "")),
      logout: async () => Promise.reject(errorFromBody(401, "")),
    });
    const api = guardSession(fake.client, () => expired++);
    await api.me().catch(() => {});
    await api.login({ email: "a", password: "b" }).catch(() => {});
    await api.logout().catch(() => {});
    expect(expired).toBe(0);
  });

  test("successful calls pass through unchanged", async () => {
    const fake = createFakeClient({ wallets: async () => [] });
    expect(await guardSession(fake.client, () => {}).wallets()).toEqual([]);
  });
});
