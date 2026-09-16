import { expect, test, type Locator, type Page } from "@playwright/test";
import { submitLogin } from "./login";

const viewports = [
  { name: "compact portrait", width: 320, height: 568 },
  { name: "short landscape", width: 667, height: 375 },
] as const;

async function navigate(page: Page, name: string) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { width: number; height: number },
) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
}

async function expectPageContained(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function expectControlsAtLeast16px(scope: Locator) {
  const sizes = await scope.locator("input, select, textarea").evaluateAll((nodes) =>
    nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
}

async function expectModalContained(
  page: Page,
  viewport: { width: number; height: number },
  { hasForm = true }: { hasForm?: boolean } = {},
) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectInsideViewport(dialog, viewport);
  expect(
    await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expectInsideViewport(close, viewport);
  await expect
    .poll(async () => (await close.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(43.9);
  const closeBounds = await close.boundingBox();
  expect(closeBounds!.height).toBeGreaterThanOrEqual(43.9);
  const titleBounds = await dialog.locator('[data-slot="dialog-title"]').boundingBox();
  expect(titleBounds).not.toBeNull();
  expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(
    closeBounds!.x,
  );

  const body = dialog.locator('[data-slot="dialog-body"]');
  await expect(body).toHaveCount(1);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();

  if (hasForm) {
    await expectControlsAtLeast16px(dialog);
    const submit = dialog.locator('button[type="submit"]').last();
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeVisible();
    await expectInsideViewport(submit, viewport);
  }
}

async function closeModal(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("every page and financial modal stays inside compact mobile viewports", async ({
  page,
}, testInfo) => {
  const suffix = `responsive-${testInfo.project.name}`;
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  expect(
    await page.evaluate(() =>
      [document.documentElement, document.body].map((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ),
  ).toEqual([16, 16]);
  await expectControlsAtLeast16px(page.locator("body"));
  await submitLogin(page);

  const headers = {
    "X-CSRF-Protection": "1",
    "Idempotency-Key": crypto.randomUUID(),
  };
  const walletResponse = await page.request.post("/api/v1/wallets", {
    headers,
    data: {
      name: `Compact wallet ${suffix}`,
      type: "physical",
      opening_balance: "5000",
    },
  });
  expect(walletResponse.ok()).toBe(true);
  const wallet = await walletResponse.json();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const recordResponse = await page.request.post("/api/v1/transactions", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      kind: "expense",
      category_id: "others-expense",
      wallet_id: wallet.id,
      amount: "125.50",
      date,
      note: `Responsive record ${suffix}`,
    },
  });
  expect(recordResponse.ok()).toBe(true);
  const billName = `A very long recurring bill name for ${suffix}`;
  const scheduleResponse = await page.request.post("/api/v1/schedules", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      name: billName,
      wallet_id: wallet.id,
      category_id: "others-expense",
      amount: "950",
      frequency: "monthly",
      start_date: date,
    },
  });
  expect(scheduleResponse.ok()).toBe(true);
  await page.reload();

  for (const viewport of viewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);

      for (const pageName of [
        "Activity",
        "Wallets",
        "Bills",
        "Monthly spending",
        "Settings",
      ]) {
        await navigate(page, pageName);
        await expectPageContained(page);
      }

      await navigate(page, "Activity");
      await page.getByRole("button", { name: "Add record", exact: true }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      await page.getByText(`Responsive record ${suffix}`, { exact: true }).click();
      await expectModalContained(page, viewport, { hasForm: false });
      await page.getByRole("button", { name: "Correct record" }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      await page.getByText(`Responsive record ${suffix}`, { exact: true }).click();
      await page.getByRole("button", { name: "Void record" }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      await navigate(page, "Wallets");
      await page.getByRole("button", { name: "Add wallet", exact: true }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      const walletCard = page
        .locator('[data-slot="card"]')
        .filter({ has: page.getByText(`Compact wallet ${suffix}`, { exact: true }) });
      await walletCard.getByRole("button", { name: "Edit wallet" }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);
      await walletCard.getByRole("button", { name: "Adjust balance" }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      await navigate(page, "Bills");
      await page.getByRole("button", { name: "Add bill", exact: true }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      await page.getByRole("button", { name: `Edit ${billName}` }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      const due = page.getByRole("article", { name: `Due ${billName}` });
      await due.getByRole("button", { name: "Confirm payment" }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);
      await due.getByRole("button", { name: "Skip" }).click();
      await expectModalContained(page, viewport);
      await closeModal(page);

      await navigate(page, "Monthly spending");
      if (viewport.width < 640) {
        await expect(page.getByTestId("monthly-mobile-list")).toBeVisible();
      } else {
        await expect(page.getByTestId("monthly-table")).toBeVisible();
      }
      await expectControlsAtLeast16px(page.locator("main"));
      await expectPageContained(page);
    });
  }
});

test("safe areas and a reduced visual viewport keep mobile controls reachable", async ({
  page,
}) => {
  const viewport = { width: 320, height: 568 };
  const visibleViewport = { width: 320, height: 280 };
  const safeLeft = 32;
  const safeRight = 24;
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await page.evaluate(
    ({ left, right }) => {
      const root = document.documentElement;
      root.style.setProperty("--safe-area-top", "20px");
      root.style.setProperty("--safe-area-right", `${right}px`);
      root.style.setProperty("--safe-area-bottom", "18px");
      root.style.setProperty("--safe-area-left", `${left}px`);
    },
    { left: safeLeft, right: safeRight },
  );

  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  const refresh = page.getByRole("button", {
    name: "Refresh records",
    exact: true,
  });
  const menuBounds = await menu.boundingBox();
  const refreshBounds = await refresh.boundingBox();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(safeLeft);
  expect(refreshBounds!.x + refreshBounds!.width).toBeLessThanOrEqual(
    viewport.width - safeRight,
  );

  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  const drawerBounds = await drawer.boundingBox();
  expect(drawerBounds!.x).toBeGreaterThanOrEqual(safeLeft);
  expect(drawerBounds!.x + drawerBounds!.width).toBeLessThanOrEqual(
    viewport.width - safeRight,
  );
  await drawer.getByRole("button", { name: "Wallets", exact: true }).click();

  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  await page.getByLabel("Wallet name", { exact: true }).focus();
  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.visualViewportOverride = "true";
    root.dataset.visualViewportReduced = "true";
    root.style.setProperty("--visual-viewport-height", "280px");
    root.style.setProperty("--visual-viewport-bottom", "288px");
  });
  await page.getByRole("dialog").evaluate(async (dialog) => {
    await Promise.all(
      dialog.getAnimations().map((animation) =>
        animation.finished.catch(() => undefined),
      ),
    );
  });
  const viewportStyles = await page.getByRole("dialog").evaluate(() => {
    const rootStyles = getComputedStyle(document.documentElement);
    return {
      heightVariable: rootStyles.getPropertyValue("--visual-viewport-height"),
      bottomVariable: rootStyles.getPropertyValue("--visual-viewport-bottom"),
      viewportWidth: window.innerWidth,
    };
  });
  expect(viewportStyles).toEqual({
    heightVariable: "280px",
    bottomVariable: "288px",
    viewportWidth: 320,
  });
  await expectModalContained(page, visibleViewport);
  const dialogBounds = await page.getByRole("dialog").boundingBox();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(safeLeft);
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(
    viewport.width - safeRight,
  );
  await expectPageContained(page);

  const landscapeViewport = { width: 844, height: 390 };
  const landscapeVisibleViewport = { width: 844, height: 220 };
  await page.setViewportSize(landscapeViewport);
  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.visualViewportReduced = "true";
    root.style.setProperty("--visual-viewport-height", "220px");
    root.style.setProperty("--visual-viewport-bottom", "170px");
  });
  await expectModalContained(page, landscapeVisibleViewport);
});
