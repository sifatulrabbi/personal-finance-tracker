import { expect, test } from "./fixtures";
import { mainNavigation, navigate, openMore, signIn, signOut } from "./login";

test("page URLs survive login, reload, and browser history", async ({ page }) => {
  await page.goto("/wallets");
  await signIn(page);

  await expect(page).toHaveURL(/\/wallets$/);
  await expect(
    page.getByRole("region", { name: "Wallets", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/wallets$/);
  await expect(
    page.getByRole("region", { name: "Wallets", exact: true }),
  ).toBeVisible();

  await navigate(page, "Bills");
  await expect(page).toHaveURL(/\/bills$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/wallets$/);
  await expect(
    page.getByRole("region", { name: "Wallets", exact: true }),
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/bills$/);
  await expect(
    page.getByRole("region", { name: "Bills", exact: true }),
  ).toBeVisible();
});

test("an unknown page stays visible until the user leaves it", async ({ page }) => {
  await page.goto("/does-not-exist");
  await signIn(page);

  await expect(page).toHaveURL(/\/does-not-exist$/);
  await expect(
    page.getByRole("heading", { name: "Page not found", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to Activity", exact: true }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(
    page.getByRole("region", { name: "Activity", exact: true }),
  ).toBeVisible();
});

test("a mixed-case or trailing-slash URL still labels and highlights its page", async ({
  page,
}) => {
  await page.goto("/Wallets/");
  await signIn(page);
  await expect(
    page.getByRole("region", { name: "Wallets", exact: true }),
  ).toBeVisible();
  await expect(page.locator("header")).toContainText("Wallets");
  await expect(page.locator("header")).not.toContainText("Page not found");
  await expect(
    mainNavigation(page).getByRole("link", { name: "Wallets", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  // A page from the More menu is highlighted inside the menu.
  await page.goto("/Settings/");
  await expect(page.getByRole("region", { name: "Settings", exact: true })).toBeVisible();
  const menu = await openMore(page);
  await expect(
    menu.getByRole("menuitem", { name: "Settings", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("signing out sends the next sign-in to Activity", async ({ page }) => {
  await page.goto("/settings");
  await signIn(page);
  await expect(
    page.getByRole("region", { name: "Settings", exact: true }),
  ).toBeVisible();
  await signOut(page);
  await expect(page).toHaveURL(/\/activity$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/activity$/);
  await expect(
    page.getByRole("region", { name: "Activity", exact: true }),
  ).toBeVisible();
  await navigate(page, "Bills");
  await expect(page).toHaveURL(/\/bills$/);
});

test("the tab bar and More menu select pages, fit phones, and restore focus", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await signIn(page);
  await expect(page).toHaveURL(/\/activity$/);
  const nav = mainNavigation(page);
  const more = nav.getByRole("button", { name: "More", exact: true });
  for (const width of [320, 390, 448]) {
    await page.setViewportSize({ width, height: 700 });
    for (const { name, path } of [
      { name: "Activity", path: "/activity" },
      { name: "Wallets", path: "/wallets" },
      { name: "Bills", path: "/bills" },
    ]) {
      const tab = nav.getByRole("link", { name, exact: true });
      const bounds = await tab.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await tab.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
      await expect(tab).toHaveAttribute("aria-current", "page");
      // Only the current tab is marked.
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
    for (const { name, path } of [
      { name: "Monthly spending", path: "/monthly" },
      { name: "Settings", path: "/settings" },
    ]) {
      const menu = await openMore(page);
      const item = menu.getByRole("menuitem", { name, exact: true });
      await expect(item).toBeVisible();
      const bounds = await item.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await item.click();
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
      // No tab claims a page that lives in More.
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
      await openMore(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(more).toBeFocused();
    }
  }
  await page.screenshot({
    path: testInfo.outputPath("navigation.png"),
    animations: "disabled",
  });

  // The tab bar stays on screen at the bottom of a long, scrolled page.
  for (let index = 0; index < 12; index++) {
    const response = await page.request.post("/api/v1/wallets", {
      headers: {
        "X-CSRF-Protection": "1",
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: {
        name: `Scroll wallet ${testInfo.project.name} ${index}`,
        type: "physical",
        opening_balance: "0",
      },
    });
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  await navigate(page, "Wallets");
  await page.setViewportSize({ width: 320, height: 700 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return window.scrollY;
      }),
    )
    .toBeGreaterThan(300);
  await expect(async () => {
    const bounds = await nav.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(700.5);
    expect(bounds!.y).toBeGreaterThan(600);
  }).toPass({ timeout: 1500 });
  // The page title stays pinned at the top while scrolled.
  const title = page.getByRole("heading", { level: 1, name: "Wallets" });
  const titleBounds = await title.boundingBox();
  expect(titleBounds!.y).toBeGreaterThanOrEqual(0);
  expect(titleBounds!.y + titleBounds!.height).toBeLessThanOrEqual(80);
  await openMore(page);
});
