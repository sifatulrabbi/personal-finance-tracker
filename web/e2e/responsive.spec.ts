import { expect, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";
import { mainNavigation, navigate, openSheet, submitLogin } from "./login";

const viewports = [
  { name: "compact portrait", width: 320, height: 568 },
  { name: "short landscape", width: 667, height: 375 },
] as const;

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
  // Measured once the sheet has slid into place.
  const dialog = await openSheet(page);
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

test("safe areas and a keyboard-sized viewport keep mobile controls reachable", async ({
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

  const title = page.getByRole("heading", { level: 1 });
  const refresh = page.getByRole("button", {
    name: "Refresh records",
    exact: true,
  });
  const titleBounds = await title.boundingBox();
  const refreshBounds = await refresh.boundingBox();
  expect(titleBounds!.x).toBeGreaterThanOrEqual(safeLeft);
  expect(titleBounds!.y).toBeGreaterThanOrEqual(20);
  expect(refreshBounds!.x + refreshBounds!.width).toBeLessThanOrEqual(
    viewport.width - safeRight,
  );

  // Every tab bar control sits inside the side insets and above the bottom inset.
  const nav = mainNavigation(page);
  const controls = [
    ...(await nav.getByRole("link").all()),
    ...(await nav.getByRole("button").all()),
  ];
  for (const control of controls) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(safeLeft);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - safeRight);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 18);
  }
  await nav.getByRole("link", { name: "Wallets", exact: true }).click();

  await page.getByRole("button", { name: "Add wallet", exact: true }).click();
  await page.getByLabel("Wallet name", { exact: true }).focus();
  // With interactive-widget=resizes-content an open keyboard shrinks the layout viewport,
  // which a smaller Playwright viewport reproduces. The sheet sizes itself with dvh.
  await page.setViewportSize(visibleViewport);
  await page.getByRole("dialog").evaluate(async (dialog) => {
    await Promise.all(
      dialog.getAnimations().map((animation) =>
        animation.finished.catch(() => undefined),
      ),
    );
  });
  await expectModalContained(page, visibleViewport);
  const dialogBounds = await page.getByRole("dialog").boundingBox();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(safeLeft);
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(
    viewport.width - safeRight,
  );
  await expectPageContained(page);

  // Regression: a visualViewport listener rewrote root CSS variables on every keyboard
  // scroll, which moved the sheet while iOS was scrolling the focused input into view.
  expect(
    await page.evaluate(() => {
      const root = document.documentElement;
      return {
        inlineVariables: [...root.style].filter((name) =>
          name.startsWith("--visual-viewport"),
        ),
        viewportData: Object.keys(root.dataset).filter((key) =>
          key.startsWith("visualViewport"),
        ),
        dialogBottom: (document.querySelector('[role="dialog"]') as HTMLElement).style
          .bottom,
      };
    }),
  ).toEqual({ inlineVariables: [], viewportData: [], dialogBottom: "" });

  const landscapeVisibleViewport = { width: 844, height: 220 };
  await page.setViewportSize(landscapeVisibleViewport);
  await expectModalContained(page, landscapeVisibleViewport);
});
