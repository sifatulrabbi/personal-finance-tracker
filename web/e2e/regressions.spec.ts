import { apiWrite, dhakaToday, expect, test } from "./fixtures";
import {
  chooseMonth,
  editTarget,
  mainNavigation,
  navigate,
  openMore,
  openWallet,
  payBill,
  signIn,
  signOut,
  toast,
} from "./login";
import type { Page } from "@playwright/test";

// Regression tests for the measured bugs in the UX audit (.planning/overhaul/ux-audit.md,
// Part 1) and the frontend review. Each test starts from a fresh database.

async function signedIn(page: Page, path = "/") {
  await page.goto(path);
  await signIn(page);
}

async function cashWallet(page: Page, name = "Cash", opening = "10000") {
  return apiWrite(page, "/wallets", {
    name,
    type: "physical",
    opening_balance: opening,
  });
}

test("Activity keeps loaded older records after a save", async ({ page }) => {
  await signedIn(page, "/activity");
  const wallet = await cashWallet(page);
  for (let i = 0; i < 60; i++)
    await apiWrite(page, "/transactions", {
      kind: "expense",
      wallet_id: wallet.id,
      amount: "1",
      date: "2026-01-15",
      note: `Old record ${i}`,
    });
  await page.reload();
  const rows = page.getByText(/^Old record \d+$/);
  // The first page of 50 also holds today's opening-balance record.
  await expect(rows).toHaveCount(49);
  await page.getByRole("button", { name: "Load older records" }).click();
  await expect(rows).toHaveCount(60);

  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("12.50");
  await page.getByLabel("Note", { exact: true }).fill("Saved after paging");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Saved after paging", { exact: true })).toBeVisible();
  // Before the fix the list snapped back to the first 50 rows (measured 69 -> 50).
  await page.waitForTimeout(500);
  await expect(rows).toHaveCount(60);
  await expect(page.getByText("Old record 0", { exact: true })).toBeVisible();
});

test("a new record appears from the save response without reloading every endpoint", async ({
  page,
}) => {
  await signedIn(page, "/activity");
  await cashWallet(page);
  await page.reload();
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("99");
  await page.getByLabel("Note", { exact: true }).fill("Shown at once");
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/"))
      requests.push(`${request.method()} ${url.pathname}`);
  });
  // A slow list endpoint must not delay the new row: it comes from the POST response.
  await page.route("**/api/v1/transactions?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByText("Shown at once", { exact: true })).toBeVisible({
    timeout: 1500,
  });
  await page.waitForTimeout(500);
  expect(requests).toContain("POST /api/v1/transactions");
  for (const unrelated of [
    "GET /api/v1/bills/due",
    "GET /api/v1/schedules",
    "GET /api/v1/settings",
    "GET /api/v1/categories",
  ])
    expect(requests).not.toContain(unrelated);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Monthly never goes blank while it refetches", async ({ page }) => {
  await signedIn(page, "/monthly");
  await expect(page.getByTestId("monthly-total")).toBeVisible();
  // Count every time the content is removed or a skeleton appears from now on.
  await page.evaluate(() => {
    const counts = { removed: 0, skeletons: 0 };
    (window as unknown as { monthlyCounts: typeof counts }).monthlyCounts = counts;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes)
          if (node instanceof HTMLElement && node.querySelector?.('[data-testid="monthly-total"]'))
            counts.removed++;
        for (const node of mutation.addedNodes)
          if (
            node instanceof HTMLElement &&
            (node.dataset.slot === "skeleton" || node.querySelector?.('[data-slot="skeleton"]'))
          )
            counts.skeletons++;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.route("**/api/v1/monthly?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await editTarget(page);
  await page.getByLabel("Monthly target (BDT)").fill("4000");
  await page.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(toast(page, "Target saved")).toBeVisible();
  const refresh = page.waitForResponse((r) => r.url().includes("/api/v1/monthly?"));
  await page.getByRole("button", { name: "Refresh records" }).click();
  await refresh;
  const otherMonth = page.waitForResponse((r) => r.url().includes("month=2025-01"));
  await chooseMonth(page, "2025-01");
  await expect(page.getByTestId("monthly-total")).toBeVisible();
  await otherMonth;
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => (window as unknown as { monthlyCounts: object }).monthlyCounts,
    ),
  ).toEqual({ removed: 0, skeletons: 0 });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("each page opens scrolled to the top", async ({ page }) => {
  await signedIn(page, "/activity");
  // Both pages must be taller than the screen, or the browser clamps the scroll anyway.
  const wallets = [];
  for (let i = 0; i < 12; i++) wallets.push(await cashWallet(page, `Scroll wallet ${i}`, "0"));
  for (let i = 0; i < 30; i++)
    await apiWrite(page, "/transactions", {
      kind: "expense",
      wallet_id: wallets[0].id,
      amount: "1",
      date: "2026-01-15",
      note: `Scroll record ${i}`,
    });
  await page.reload();
  await expect(page.getByText("Scroll record 29", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1500);
  await navigate(page, "Wallets");
  await expect(page.getByText("Scroll wallet 11", { exact: true })).toBeAttached();
  // Regression: Wallets opened scrolled far down, hiding its title and "Add wallet".
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("button", { name: "Add wallet", exact: true })).toBeInViewport();
});

test("focus returns to the opener after a dialog closes, and opening selects nothing", async ({
  page,
}) => {
  await signedIn(page, "/wallets");
  await cashWallet(page, "Focus wallet");
  await page.reload();
  const add = page.getByRole("button", { name: "Add wallet", exact: true });
  await add.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();

  await openWallet(page, "Focus wallet");
  const edit = page.getByRole("button", { name: "Edit wallet" });
  await edit.click();
  const name = page.getByLabel("Wallet name", { exact: true });
  await expect(name).toHaveValue("Focus wallet");
  // Regression: Radix focused the name and selected it, so one keystroke replaced it.
  await expect(name).not.toBeFocused();
  expect(
    await name.evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!),
  ).toBe(0);
  await name.fill("Focus wallet renamed");
  await page.getByRole("button", { name: "Save wallet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Focus wallet renamed", { exact: true })).toBeVisible();
  // Regression: focus fell back to <body> after every dialog.
  await expect(edit).toBeFocused();

  await navigate(page, "Activity");
  const addRecord = page.getByRole("button", { name: "Add record", exact: true });
  await addRecord.click();
  await page.getByLabel("Amount", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(addRecord).toBeFocused();
});

test("creating a category does not wipe the other category form", async ({ page }) => {
  await signedIn(page, "/settings");
  const income = page.getByRole("region", { name: "Income categories", exact: true });
  const expense = page.getByRole("region", { name: "Expense categories", exact: true });
  await income.getByLabel("Category name").fill("Half typed income name");
  await expense.getByLabel("Category name").fill("Pets");
  await expense.getByRole("button", { name: "Add category" }).click();
  await expect(expense.getByText("Pets", { exact: true })).toBeVisible();
  await expect(expense.getByLabel("Category name")).toHaveValue("");
  await expect(income.getByLabel("Category name")).toHaveValue("Half typed income name");
});

test("a duplicate category shows the server's message", async ({ page }) => {
  await signedIn(page, "/settings");
  const expense = page.getByRole("region", { name: "Expense categories", exact: true });
  await expense.getByLabel("Category name").fill("Pets");
  await expense.getByRole("button", { name: "Add category" }).click();
  await expect(expense.getByText("Pets", { exact: true })).toBeVisible();
  await expense.getByLabel("Category name").fill("Pets");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/categories") && r.request().method() === "POST",
  );
  await expense.getByRole("button", { name: "Add category" }).click();
  const body = await (await response).json();
  const alert = expense.getByRole("alert");
  await expect(alert).toBeVisible();
  // With the shared error envelope the exact server text is shown.
  if (body?.error && typeof body.error === "object")
    await expect(alert).toContainText(body.error.message);
  await expect(alert).not.toContainText("decimal places");
});

test("an expired session keeps the open form and asks to sign in again", async ({ page }) => {
  await signedIn(page, "/wallets");
  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  await page.getByLabel("Wallet name", { exact: true }).fill("Draft after expiry");
  await page.getByLabel("Opening balance").fill("321.45");
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Create wallet", exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Sign in again" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByLabel("Email", { exact: true })).toHaveValue("test@example.test");
  await prompt.getByLabel("Password", { exact: true }).fill("test-household-password");
  await prompt.getByRole("button", { name: "Sign in and continue" }).click();
  await expect(prompt).toHaveCount(0);
  // The draft survived, and saving now works.
  await expect(page.getByLabel("Wallet name", { exact: true })).toHaveValue("Draft after expiry");
  await expect(page.getByLabel("Opening balance")).toHaveValue("321.45");
  await page.getByRole("button", { name: "Create wallet", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("৳321.45", { exact: true })).toBeVisible();
});

test("signing out works when the session has already expired", async ({ page }) => {
  await signedIn(page, "/settings");
  await page.context().clearCookies();
  await signOut(page);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test("an unreachable server shows an error with retry, not the login screen", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) => route.abort("connectionrefused"));
  await page.goto("/wallets");
  await expect(
    page.getByRole("heading", { name: "Cannot reach Simply Finance" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await page.unroute("**/api/v1/me");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("an invalid bill amount is an error and is never sent as blank", async ({ page }) => {
  await signedIn(page);
  const wallet = await cashWallet(page, "Bill cash", "5000");
  await apiWrite(page, "/schedules", {
    name: "Internet",
    wallet_id: wallet.id,
    amount: "1000",
    frequency: "monthly",
    start_date: dhakaToday(),
  });
  await page.reload();
  await navigate(page, "Bills");
  let confirms = 0;
  page.on("request", (request) => {
    if (request.url().includes("/confirm")) confirms++;
  });
  await payBill(page, "Internet");
  const amount = page.getByLabel("Amount paid");
  await expect(amount).toHaveAttribute("type", "text");
  await expect(amount).toHaveAttribute("inputmode", "decimal");
  // A comma decimal from a regional keyboard: before the fix WebKit read it as empty and
  // the bill was recorded at the scheduled 1000.
  await amount.fill("1020,50");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert").first()).toContainText(
    "dot for decimals",
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(confirms).toBe(0);
  await amount.fill("1020.50");
  await page.getByRole("button", { name: "Record payment", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(confirms).toBe(1);
  await navigate(page, "Wallets");
  await expect(page.getByText("৳3,979.50", { exact: true })).toBeVisible();
});

test("choosing a page in the More menu leaves nothing over the new page", async ({
  page,
}) => {
  await signedIn(page);
  const menu = await openMore(page);
  await menu.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.finish()),
  );
  // Choose and check two frames later, well inside the old ~200ms fade-out of the
  // hamburger drawer this menu replaced.
  const leftovers = await page.evaluate(async () => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (a) => a.textContent === "Settings",
    ) as HTMLElement;
    item.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.querySelectorAll(
      '[role="menu"], [data-slot="dialog-overlay"], [data-slot="drawer-overlay"]',
    ).length;
  });
  expect(leftovers).toBe(0);
  await expect(page).toHaveURL(/\/settings$/);
  // A tab never shows an overlay at all.
  await mainNavigation(page).getByRole("link", { name: "Wallets", exact: true }).click();
  await expect(page).toHaveURL(/\/wallets$/);
  expect(
    await page.evaluate(
      () => document.querySelectorAll('[data-slot="dialog-overlay"], [data-slot="drawer-overlay"]').length,
    ),
  ).toBe(0);
});
