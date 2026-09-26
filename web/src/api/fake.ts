import type { ApiClient } from "./client";

export type FakeCall = { method: keyof ApiClient; args: unknown[] };

// A scripted ApiClient for unit tests: pass only the methods a test needs. Every call is
// recorded, and an unscripted method rejects so a test cannot pass by accident.
export function createFakeClient(script: Partial<ApiClient> = {}) {
  const calls: FakeCall[] = [];
  const client = new Proxy({} as ApiClient, {
    get(_, property: string) {
      return (...args: unknown[]) => {
        const method = property as keyof ApiClient;
        calls.push({ method, args });
        const implementation = script[method] as
          | ((...a: unknown[]) => Promise<unknown>)
          | undefined;
        if (!implementation)
          return Promise.reject(new Error(`fake client: ${property} is not scripted`));
        return implementation(...args);
      };
    },
  });
  return {
    client,
    calls,
    callsTo: (method: keyof ApiClient) => calls.filter((c) => c.method === method),
  };
}
