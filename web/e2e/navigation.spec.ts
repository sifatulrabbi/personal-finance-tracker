import { expect, test } from "@playwright/test";
import { submitLogin } from "./login";

test("mobile menu selects pages, fits phones, and restores focus", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  const trigger = page.getByRole("button", { name: "Open menu", exact: true });
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  for (const width of [320, 390, 448]) {
    await page.setViewportSize({ width, height: 700 });
    for (const name of [
      "Activity",
      "Wallets",
      "Bills",
      "Monthly spending",
      "Settings",
    ]) {
      await trigger.click();
      const item = drawer.getByRole("button", { name, exact: true });
      await expect(item).toBeVisible();
      const bounds = await item.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThan(width);
      await item.click();
      await expect(drawer).toHaveCount(0);
      await expect(
        page.getByRole("region", { name, exact: true }),
      ).toBeVisible();
      await trigger.click();
      await expect(
        drawer.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  }
  await trigger.click();
  await drawer.getByRole("button", { name: "Close menu" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    drawer.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    drawer.getByRole("button", { name: "Close menu" }),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("navigation.png"),
    animations: "disabled",
  });
  await page.mouse.click(440, 350);
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole("button", { name: "Close menu" }).click();
  await expect(drawer).toHaveCount(0);

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
  await trigger.click();
  await drawer.getByRole("button", { name: "Wallets", exact: true }).click();
  await expect(drawer).toHaveCount(0);
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
    const bounds = await trigger.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(80);
  }).toPass({ timeout: 1500 });
  await trigger.click();
  await expect(drawer).toBeVisible();
});
