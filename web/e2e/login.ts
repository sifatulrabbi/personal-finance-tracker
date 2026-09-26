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

// The More button in the page header on phones and tablets.
export function moreButton(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: "More", exact: true });
}

// Opens the More menu in the page header.
export async function openMore(page: Page) {
  await moreButton(page).click();
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
  // An open or closing sheet hides the rest of the page from assistive technology.
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  const more = moreButton(page);
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
}

// A wallet's compact row on the Wallets page.
export function walletRow(page: Page, name: string) {
  return page
    .getByTestId("wallet-row")
    .filter({ has: page.getByText(name, { exact: true }) });
}

// Opens a wallet's detail page from the Wallets page.
export async function openWallet(page: Page, name: string) {
  await walletRow(page, name).click();
  await expect(page.getByRole("region", { name: "Wallet details", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

// An unpaid bill's row on the Bills page.
export function dueBill(page: Page, name: string) {
  return page.getByRole("article", { name: `Due ${name}` });
}

export async function payBill(page: Page, name: string) {
  await dueBill(page, name).getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page.getByRole("dialog", { name: `Pay ${name}` })).toBeVisible();
}

export async function skipBill(page: Page, name: string) {
  await dueBill(page, name).getByRole("button", { name: `More actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Skip this bill" }).click();
  await expect(page.getByRole("dialog", { name: "Skip this bill" })).toBeVisible();
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthText(month: string) {
  const [year, number] = month.split("-").map(Number);
  return `${monthNames[number - 1]} ${year}`;
}

// Picks a month (YYYY-MM) on Monthly spending with the month picker, the way a person
// would on either engine: step the year, then tap the month.
export async function chooseMonth(page: Page, month: string) {
  const year = Number(month.slice(0, 4));
  await page.getByRole("button", { name: /^Choose month/ }).click();
  const picker = await openSheet(page);
  const shown = picker.getByTestId("picker-year");
  for (let step = 0; step < 50; step++) {
    const current = Number(await shown.textContent());
    if (current === year) break;
    await picker
      .getByRole("button", { name: current > year ? "Previous year" : "Next year" })
      .click();
    await expect(shown).not.toHaveText(String(current));
  }
  await picker.getByRole("button", { name: monthText(month), exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("monthly-month")).toHaveText(monthText(month));
}

// Opens the inline target form on Monthly spending.
export async function editTarget(page: Page) {
  await page.getByRole("button", { name: /^(Edit|Set) target$/ }).click();
  await expect(page.getByLabel("Monthly target (BDT)")).toBeVisible();
}

// A confirmation toast with the given text.
export function toast(page: Page, text: string) {
  return page.locator("[data-sonner-toast]").filter({ hasText: text });
}
