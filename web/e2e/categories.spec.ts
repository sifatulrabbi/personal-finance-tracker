import { expect, test, type Page } from "@playwright/test";
import { submitLogin } from "./login";

test("inline categories remain available after canceling a record", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeVisible();
  const wallet = await page.request.post("/api/v1/wallets", {
    headers: {
      "X-CSRF-Protection": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: { name: `Draft cash ${info.project.name}`, type: "physical" },
  });
  expect(wallet.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page.getByRole("button", { name: "New category", exact: true }).click();
  const name = `Saved without record ${info.project.name}`;
  await page.getByLabel("New category name").fill(name);
  await page
    .getByRole("button", { name: "Create and select", exact: true })
    .click();
  await expect(
    page.getByLabel("Category", { exact: true }).locator("option:checked"),
  ).toHaveText(name);
  await page.keyboard.press("Escape");
  await navigate(page, "Settings");
  await expect(
    page
      .getByRole("region", { name: "Expense categories", exact: true })
      .getByText(name, { exact: true }),
  ).toBeVisible();
});

async function navigate(page: Page, name: string) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("categories preserve record drafts and monthly shares use actual spending", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await navigate(page, "Settings");
  const income = page.getByRole("region", {
    name: "Income categories",
    exact: true,
  });
  await income.getByLabel("Category name").fill(`Salary ${info.project.name}`);
  await income.getByRole("button", { name: "Create category" }).click();
  await expect(
    income.getByText(`Salary ${info.project.name}`, { exact: true }),
  ).toBeVisible();
  const response = await page.request.post("/api/v1/wallets", {
    headers: {
      "X-CSRF-Protection": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: {
      name: `Category cash ${info.project.name}`,
      type: "physical",
      opening_balance: "10000",
    },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("200");
  const month = info.project.name === "mobile-chromium" ? "2025-04" : "2025-05";
  await page.getByLabel("Date", { exact: true }).fill(`${month}-10`);
  await page
    .getByLabel("Note", { exact: true })
    .fill(`Category draft ${info.project.name}`);
  await page.getByRole("button", { name: "New category", exact: true }).click();
  await page
    .getByLabel("New category name")
    .fill(`Eating out ${info.project.name}`);
  await page
    .getByRole("button", { name: "Create and select", exact: true })
    .click();
  await expect(
    page.getByLabel("Category", { exact: true }).locator("option:checked"),
  ).toHaveText(`Eating out ${info.project.name}`);
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("200");
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue(
    `Category draft ${info.project.name}`,
  );
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page.getByLabel("Transaction type").selectOption("income");
  await expect(
    page.getByLabel("Category", { exact: true }).locator("option:checked"),
  ).toHaveText("Others");
  await expect(
    page.getByLabel("Category", { exact: true }).locator("option"),
  ).toContainText(["Others", `Salary ${info.project.name}`]);
  await expect(
    page
      .getByLabel("Category", { exact: true })
      .locator("option")
      .filter({ hasText: `Eating out ${info.project.name}` }),
  ).toHaveCount(0);
  await page.getByLabel("Transaction type").selectOption("transfer");
  await expect(page.getByLabel("Category", { exact: true })).toHaveCount(0);
  await page.getByLabel("Transaction type").selectOption("expense");
  await expect(
    page.getByLabel("Category", { exact: true }).locator("option:checked"),
  ).toHaveText("Others");
  await page.getByLabel("Amount", { exact: true }).fill("600");
  await page.getByLabel("Date", { exact: true }).fill(`${month}-11`);
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Monthly spending");
  await page.getByLabel("Month", { exact: true }).fill(month);
  await expect(page.getByTestId("monthly-total")).toHaveText("৳800.00");
  await page.getByLabel("Monthly target (BDT)").fill("4000");
  await page.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Target saved");
  const row = page
    .getByRole("row")
    .filter({ hasText: `Eating out ${info.project.name}` });
  await expect(row).toContainText("৳200.00");
  await expect(row).toContainText("25.00%");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: info.outputPath("monthly-spending.png"),
    fullPage: true,
  });
  await navigate(page, "Activity");
  await page
    .getByText(`Category draft ${info.project.name}`, { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Correct record", exact: true })
    .click();
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Others" });
  await page.getByLabel("Reason for correction").fill("Correct category");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByText(`Category draft ${info.project.name}`, { exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(`Category: Eating out ${info.project.name}`, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await navigate(page, "Monthly spending");
  await page.getByLabel("Month", { exact: true }).fill(month);
  await expect(page.getByLabel("Monthly target (BDT)")).toHaveValue("4000.00");
  await expect(page.getByTestId("monthly-total")).toHaveText("৳800.00");
  await expect(
    page.getByRole("row").filter({ hasText: "Others" }),
  ).toContainText("100.00%");
  await navigate(page, "Bills");
  await page.getByRole("button", { name: "Add bill", exact: true }).click();
  const billName = `Categorized bill ${info.project.name}`;
  await page.getByLabel("Bill name").fill(billName);
  await page.getByLabel("Expected amount").fill("100");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: `Eating out ${info.project.name}` });
  await page.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("article", { name: `Due ${billName}` })
    .getByRole("button", { name: "Confirm payment" })
    .click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Activity");
  await page.getByText(`${billName}:`, { exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(`Category: Eating out ${info.project.name}`, { exact: true })
      .first(),
  ).toBeVisible();
});
