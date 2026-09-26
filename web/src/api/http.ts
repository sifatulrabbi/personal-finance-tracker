import type { ApiClient, WriteOptions } from "./client";
import { ApiError, errorFromBody, networkError } from "./errors";

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export type HttpClientOptions = {
  fetch?: Fetch;
  baseUrl?: string;
  // A stalled mobile request must not leave a form stuck on "Saving…" forever.
  timeoutMs?: number;
};

const enc = encodeURIComponent;

export function createHttpClient(options: HttpClientOptions = {}): ApiClient {
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const baseUrl = options.baseUrl ?? "/api/v1";
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    write?: WriteOptions,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Protection": "1",
          ...(write ? { "Idempotency-Key": write.key } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw networkError(timedOut ? "timeout" : "offline");
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text().catch(() => "");
    if (!response.ok) throw errorFromBody(response.status, text);
    try {
      return (text ? JSON.parse(text) : undefined) as T;
    } catch {
      throw new ApiError({
        status: response.status,
        code: "internal",
        message: "The server sent an unreadable answer. Reload the page and try again.",
      });
    }
  }

  const get = <T>(path: string) => request<T>("GET", path);
  const page = (path: string, p: { limit: number; offset: number }) =>
    `${path}?limit=${p.limit}&offset=${p.offset}`;

  return {
    me: () => get("/me"),
    login: (input) => request("POST", "/login", input),
    logout: async () => {
      await request("POST", "/logout", {});
    },

    wallets: () => get("/wallets"),
    createWallet: (input, o) => request("POST", "/wallets", input, o),
    updateWallet: (input, o) => request("PUT", `/wallets/${enc(input.id)}`, input, o),
    adjustWallet: (id, input, o) => request("POST", `/wallets/${enc(id)}/adjust`, input, o),

    transactions: (p) => get(page("/transactions", p)),
    createTransaction: (input, o) => request("POST", "/transactions", input, o),
    correctTransaction: (id, input, o) => request("PUT", `/transactions/${enc(id)}`, input, o),
    voidTransaction: (id, input, o) => request("POST", `/transactions/${enc(id)}/void`, input, o),
    history: (id) => get(`/transactions/${enc(id)}/history`),

    categories: () => get("/categories"),
    createCategory: (input, o) => request("POST", "/categories", input, o),

    settings: () => get("/settings"),
    updateSettings: (input, o) => request("PUT", "/settings", input, o),

    monthly: (month) => get(`/monthly?month=${enc(month)}`),
    setMonthlyTarget: (month, input, o) =>
      request("PUT", `/monthly/${enc(month)}/target`, input, o),

    schedules: () => get("/schedules"),
    createSchedule: (input, o) => request("POST", "/schedules", input, o),
    updateSchedule: (input, o) => request("PUT", `/schedules/${enc(input.id)}`, input, o),
    dueBills: () => get("/bills/due"),
    confirmBill: (id, input, o) => request("POST", `/bills/${enc(id)}/confirm`, input, o),
    skipBill: (id, input, o) => request("POST", `/bills/${enc(id)}/skip`, input, o),

    audit: (p) => get(page("/audit", p)),
  };
}
