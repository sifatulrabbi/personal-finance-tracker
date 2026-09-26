import { test as base, expect, type Page } from "@playwright/test";
import { controlOrigin } from "./ports";

// Every test starts on a fresh copy of the migrated and seeded database, so no test
// depends on what another test (or the other browser project) left behind.
export const test = base.extend<{ freshDatabase: void }>({
  freshDatabase: [
    // Playwright requires the object-destructuring form for fixtures without dependencies.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const response = await fetch(`${controlOrigin}/reset`, { method: "POST" });
      if (!response.ok) throw new Error("Could not reset the e2e database");
      await use();
    },
    { auto: true },
  ],
});

export { expect };

// Writes through the real API with the browser's session cookie, for test setup.
export async function apiWrite<T = any>(
  page: Page,
  path: string,
  data: unknown,
  method = "POST",
): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers: {
      "X-CSRF-Protection": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    data,
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return response.json();
}

export function dhakaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
