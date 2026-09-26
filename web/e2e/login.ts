import { expect, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

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
  await expect(mainNavigation(page)).toBeVisible();
}

export async function signIn(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
}

// The bottom tab bar on phones, the sidebar on wide screens. Only one is displayed.
export function mainNavigation(page: Page) {
  return page.getByRole("navigation", { name: "Main navigation" });
}

// Opens the More menu of the phone tab bar.
export async function openMore(page: Page) {
  await mainNavigation(page).getByRole("button", { name: "More", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // Measure the menu at rest, not while it zooms in.
  await settled(menu);
  return menu;
}

// Waits until an element's open animation has finished, so its size and position are final.
export async function settled(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

// The sheet (bottom drawer on phones, dialog on wide screens), once it has slid into place.
export async function openSheet(page: Page) {
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await settled(sheet);
  return sheet;
}

// Goes to a page the way a person would: its tab or sidebar link, or the More menu for
// pages that have no tab.
export async function navigate(page: Page, name: string) {
  const link = mainNavigation(page).getByRole("link", { name, exact: true });
  if (await link.count()) {
    await link.click();
  } else {
    const menu = await openMore(page);
    await menu.getByRole("menuitem", { name, exact: true }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
  }
  await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
}

// Sign out lives in the More menu on phones and in the sidebar on wide screens.
export async function signOut(page: Page) {
  const more = mainNavigation(page).getByRole("button", { name: "More", exact: true });
  if (await more.count()) {
    await more.click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
}

// A confirmation toast with the given text.
export function toast(page: Page, text: string) {
  return page.locator("[data-sonner-toast]").filter({ hasText: text });
}
