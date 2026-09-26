import { expect, test, type Page } from "@playwright/test";

export async function submitLogin(page: Page) {
  async function submit() {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/login") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    return response;
  }
  let response = await submit();
  if (response.status() === 429) {
    test.setTimeout(120_000);
    const seconds = Number(response.headers()["retry-after"]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
    await page.waitForTimeout(seconds * 1000 + 100);
    response = await submit();
  }
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeVisible();
}

export async function signIn(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
}

export async function navigate(page: Page, name: string) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
}
