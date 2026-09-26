import { apiWrite, expect, test } from "./fixtures";
import { mainNavigation, navigate, openMore, signIn, toast } from "./login";
import type { Page } from "@playwright/test";

// The app shell from phase F2: bottom tab bar, More menu, center Add button, desktop
// sidebar, and the light/dark theme.

async function signedIn(page: Page, path = "/") {
  await page.goto(path);
  await signIn(page);
}

async function isDark(page: Page) {
  return page.evaluate(() => document.documentElement.classList.contains("dark"));
}

function background(page: Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

test("the tab bar marks the current page on every tab", async ({ page }) => {
  await signedIn(page);
  const nav = mainNavigation(page);
  await expect(nav.getByRole("link")).toHaveText(["Activity", "Wallets", "Bills"]);
  await expect(nav.getByRole("button")).toHaveText(["", "More"]);
  for (const name of ["Wallets", "Bills", "Activity"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const other of ["Activity", "Wallets", "Bills"].filter((n) => n !== name))
      await expect(nav.getByRole("link", { name: other, exact: true })).not.toHaveAttribute(
        "aria-current",
      );
  }
});

test("the More menu holds Monthly spending, Settings, theme, and sign out", async ({
  page,
}) => {
  await signedIn(page);
  const menu = await openMore(page);
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Monthly spending",
    "Settings",
    "Sign out",
  ]);
  await expect(menu.getByRole("menuitemradio")).toHaveText(["Light", "Dark", "System"]);
  await expect(menu.getByRole("menuitemradio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await menu.getByRole("menuitem", { name: "Monthly spending" }).click();
  await expect(page).toHaveURL(/\/monthly$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Monthly spending");
  await navigate(page, "Settings");
  await expect(page).toHaveURL(/\/settings$/);
  await (await openMore(page)).getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("the center Add button opens the add-record sheet from any page", async ({ page }) => {
  await signedIn(page, "/bills");
  const add = mainNavigation(page).getByRole("button", { name: "Add record", exact: true });
  // Without a wallet the sheet explains what to do instead of showing a dead form.
  await add.click();
  const sheet = page.getByRole("dialog", { name: "Add record" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Add a wallet first")).toBeVisible();
  await sheet.getByRole("link", { name: "Go to Wallets" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/wallets$/);

  await apiWrite(page, "/wallets", { name: "Shell cash", type: "physical", opening_balance: "500" });
  await page.reload();
  await navigate(page, "Bills");
  await add.click();
  await expect(sheet).toBeVisible();
  // A phone gets a bottom sheet: it touches the bottom edge of the screen.
  const viewport = page.viewportSize()!;
  await expect(async () => {
    const bounds = await sheet.boundingBox();
    expect(Math.abs(bounds!.y + bounds!.height - viewport.height)).toBeLessThan(2);
  }).toPass({ timeout: 2000 });
  await sheet.getByLabel("Amount", { exact: true }).fill("42");
  await sheet.getByLabel("Note", { exact: true }).fill("From the Add button");
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  // Saving confirms with a toast, and focus goes back to the Add button.
  await expect(toast(page, "Record saved")).toBeVisible();
  await expect(add).toBeFocused();
  await navigate(page, "Activity");
  await expect(page.getByText("From the Add button", { exact: true })).toBeVisible();
  await expect(
    page.getByTestId("activity-row").filter({ hasText: "From the Add button" }),
  ).toContainText("−৳42.00");
});

test("the dark theme applies and the choice survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signedIn(page);
  expect(await isDark(page)).toBe(false);
  const light = await background(page);

  await (await openMore(page)).getByRole("menuitemradio", { name: "Dark" }).click();
  await expect.poll(() => isDark(page)).toBe(true);
  const dark = await background(page);
  expect(dark).not.toBe(light);
  // rgb(15, 21, 18) is the dark background token.
  expect(dark).toBe("rgb(15, 21, 18)");

  await page.reload();
  await expect(mainNavigation(page)).toBeVisible();
  expect(await isDark(page)).toBe(true);
  expect(await background(page)).toBe(dark);

  // System follows the device, in both directions.
  await (await openMore(page)).getByRole("menuitemradio", { name: "System" }).click();
  await expect.poll(() => isDark(page)).toBe(false);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => isDark(page)).toBe(true);
  await page.reload();
  await expect(mainNavigation(page)).toBeVisible();
  expect(await isDark(page)).toBe(true);

  // An explicit Light choice wins over a dark device.
  await navigate(page, "Settings");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect.poll(() => isDark(page)).toBe(false);
  await page.reload();
  await expect(mainNavigation(page)).toBeVisible();
  expect(await isDark(page)).toBe(false);
});

test("no page scrolls sideways on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await signedIn(page);
  await apiWrite(page, "/wallets", {
    name: "A wallet with a rather long name for a small phone",
    type: "card",
    card_type: "credit",
    credit_limit: "900000000",
    opening_balance: "123456789.99",
  });
  await page.reload();
  for (const name of ["Activity", "Wallets", "Bills", "Monthly spending", "Settings"]) {
    await navigate(page, name);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(320);
  }
});

test("tab bar controls are at least 44px and clear the home indicator", async ({ page }) => {
  await signedIn(page);
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--safe-area-bottom", "34px"),
  );
  const nav = mainNavigation(page);
  const controls = [
    ...(await nav.getByRole("link").all()),
    ...(await nav.getByRole("button").all()),
  ];
  expect(controls).toHaveLength(5);
  const navBounds = (await nav.boundingBox())!;
  for (const control of controls) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    // Nothing sits in the 34px strip reserved for the home indicator.
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(navBounds.y + navBounds.height - 34);
  }
});

test("wide screens get a sidebar with the same destinations and a centered dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signedIn(page);
  const nav = mainNavigation(page);
  // Exactly one main navigation is exposed: the sidebar, not the tab bar.
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole("link")).toHaveText([
    "Activity",
    "Wallets",
    "Bills",
    "Monthly spending",
    "Settings",
  ]);
  const bounds = (await nav.boundingBox())!;
  expect(bounds.x).toBeLessThan(300);
  await expect(page.getByRole("button", { name: "More", exact: true })).toHaveCount(0);
  for (const name of ["Monthly spending", "Settings", "Wallets"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add record", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add record" });
  await expect(dialog).toBeVisible();
  await expect(async () => {
    const box = (await dialog.boundingBox())!;
    // Centered, not a bottom sheet.
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2);
    expect(box.y + box.height).toBeLessThan(800 - 16);
  }).toPass({ timeout: 2000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add record", exact: true })).toBeFocused();
});

test("sheets skip their motion when the device asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signedIn(page);
  await mainNavigation(page).getByRole("button", { name: "Add record" }).click();
  const sheet = page.getByRole("dialog", { name: "Add record" });
  await expect(sheet).toBeVisible();
  const duration = await sheet.evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
});

test("keyboard focus is visible on navigation and buttons", async ({ page }) => {
  await signedIn(page);
  // A key press first, so the browser treats the next focus as keyboard focus.
  await page.keyboard.press("Shift");
  for (const control of [
    mainNavigation(page).getByRole("link", { name: "Wallets", exact: true }),
    page.getByRole("button", { name: "Refresh records", exact: true }),
  ]) {
    await control.focus();
    await expect(control).toBeFocused();
    expect(await control.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    const ring = await control.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(ring).not.toBe("none");
  }
});
