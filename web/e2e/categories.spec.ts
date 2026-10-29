import { apiWrite, dhakaToday, expect, test } from "./fixtures";
import {
  chooseMonth,
  editTarget,
  mainNavigation,
  navigate,
  payBill,
  signIn,
  submitLogin,
  toast,
} from "./login";
import { categoryRadio, kindRadio, openAddRecord, typeAmount } from "./records";

test("inline categories remain available after canceling a record", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-household-password");
  await submitLogin(page);
  await expect(mainNavigation(page)).toBeVisible();
  const wallet = await page.request.post("/api/v1/wallets", {
    headers: {
      "X-CSRF-Protection": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: { name: `Draft cash ${info.project.name}`, type: "physical" },
  });
  expect(wallet.ok()).toBe(true);
  await page.reload();
  const sheet = await openAddRecord(page);
  await sheet.getByRole("button", { name: "New category", exact: true }).click();
  const name = `Saved without record ${info.project.name}`;
  await sheet.getByLabel("New category name").fill(name);
  await sheet
    .getByRole("button", { name: "Create and select", exact: true })
    .click();
  await expect(categoryRadio(sheet, name)).toBeChecked();
  await page.keyboard.press("Escape");
  await navigate(page, "Settings");
  await expect(
    page
      .getByRole("region", { name: "Expense categories", exact: true })
      .getByText(name, { exact: true }),
  ).toBeVisible();
});

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
  await income.getByRole("button", { name: "Add category" }).click();
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
  await navigate(page, "Activity");
  let sheet = await openAddRecord(page);
  await typeAmount(sheet, "200");
  const month = info.project.name === "mobile-chromium" ? "2025-04" : "2025-05";
  await sheet.getByLabel("Date", { exact: true }).fill(`${month}-10`);
  await sheet
    .getByLabel("Note", { exact: true })
    .fill(`Category draft ${info.project.name}`);
  await sheet.getByRole("button", { name: "New category", exact: true }).click();
  // Save waits while a category is being created.
  await expect(sheet.getByRole("button", { name: "Save record", exact: true })).toBeDisabled();
  await sheet
    .getByLabel("New category name")
    .fill(`Eating out ${info.project.name}`);
  await sheet
    .getByRole("button", { name: "Create and select", exact: true })
    .click();
  await expect(categoryRadio(sheet, `Eating out ${info.project.name}`)).toBeChecked();
  await expect(sheet.getByLabel("Amount", { exact: true })).toHaveValue("200");
  await expect(sheet.getByLabel("Note", { exact: true })).toHaveValue(
    `Category draft ${info.project.name}`,
  );
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  sheet = await openAddRecord(page);
  await kindRadio(sheet, "income").check();
  await expect(categoryRadio(sheet, "Others")).toBeChecked();
  const categories = sheet.getByRole("group", { name: "Category", exact: true }).getByRole("radio");
  await expect(categories).toHaveCount(2);
  await expect(categoryRadio(sheet, `Salary ${info.project.name}`)).toBeVisible();
  await expect(categoryRadio(sheet, `Eating out ${info.project.name}`)).toHaveCount(0);
  await kindRadio(sheet, "transfer").check();
  await expect(sheet.getByRole("group", { name: "Category", exact: true })).toHaveCount(0);
  await kindRadio(sheet, "expense").check();
  await expect(categoryRadio(sheet, "Others")).toBeChecked();
  await typeAmount(sheet, "600");
  await sheet.getByLabel("Date", { exact: true }).fill(`${month}-11`);
  await sheet.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Monthly spending");
  await chooseMonth(page, month);
  await expect(page.getByTestId("monthly-total")).toHaveText("৳800.00");
  await editTarget(page);
  await page.getByLabel("Monthly target (BDT)").fill("4000");
  await page.getByRole("button", { name: "Save target", exact: true }).click();
  await expect(toast(page, "Target saved")).toBeVisible();
  await expect(page.getByTestId("monthly-target")).toHaveText("৳4,000.00");
  const row = page
    .getByTestId("monthly-category")
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
  sheet = page.getByRole("dialog");
  await expect(categoryRadio(sheet, `Eating out ${info.project.name}`)).toBeChecked();
  await categoryRadio(sheet, "Others").check();
  await sheet.getByLabel("Reason for correction").fill("Correct category");
  await sheet
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByText(`Category draft ${info.project.name}`, { exact: true })
    .click();
  // The current record is in Others; the first version keeps its original category.
  const history = page.getByRole("dialog").getByTestId("history-entry");
  await expect(history.first()).toContainText("Others");
  await expect(history.last()).toContainText(`Eating out ${info.project.name}`);
  await page.keyboard.press("Escape");
  await navigate(page, "Monthly spending");
  await chooseMonth(page, month);
  await expect(page.getByTestId("monthly-target")).toHaveText("৳4,000.00");
  await editTarget(page);
  await expect(page.getByLabel("Monthly target (BDT)")).toHaveValue("4000.00");
  await expect(page.getByTestId("monthly-total")).toHaveText("৳800.00");
  await expect(
    page.getByTestId("monthly-category").filter({ hasText: "Others" }),
  ).toContainText("100.00%");
  await navigate(page, "Bills");
  await page.getByRole("button", { name: "Add bill", exact: true }).click();
  const billName = `Categorized bill ${info.project.name}`;
  await page.getByLabel("Bill name", { exact: true }).fill(billName);
  await page.getByLabel("Expected amount").fill("100");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: `Eating out ${info.project.name}` });
  await page.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await payBill(page, billName);
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Activity");
  await page.getByText(`${billName}:`, { exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(`Eating out ${info.project.name}`, { exact: true })
      .first(),
  ).toBeVisible();
});

test("a renamed category relabels its records and survives a partner's rename", async ({ page }) => {
  await page.goto("/");
  await signIn(page);
  const wallet = await apiWrite(page, "/wallets", { name: "Cash", type: "physical", opening_balance: "1000" });
  await apiWrite(page, "/transactions", {
    kind: "expense",
    wallet_id: wallet.id,
    amount: "120",
    date: dhakaToday(),
    note: "Weekly vegetables",
    category_id: "expense-groceries",
  });
  await page.reload();
  await navigate(page, "Settings");
  const expenses = page.getByRole("region", { name: "Expense categories", exact: true });
  await expenses.getByRole("button", { name: "Rename Groceries", exact: true }).click();
  await expenses.getByLabel("Rename Groceries", { exact: true }).fill("Bazaar");
  await expenses.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(toast(page, "Category renamed")).toBeVisible();
  await expect(expenses.getByText("Bazaar", { exact: true })).toBeVisible();
  await expect(expenses.getByText("Groceries", { exact: true })).toHaveCount(0);

  await apiWrite(page, "/categories/expense-maid", { name: "House help", version: 1 }, "PUT");
  await expenses.getByRole("button", { name: "Rename Maid", exact: true }).click();
  await expenses.getByLabel("Rename Maid", { exact: true }).fill("Cleaner");
  await expenses.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(expenses.getByRole("alert")).toContainText("changed");
  await expenses.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(expenses.getByRole("button", { name: "Rename Cleaner", exact: true })).toBeVisible();
  await expect(expenses.getByText("House help", { exact: true })).toHaveCount(0);

  await navigate(page, "Activity");
  const row = page.getByTestId("activity-row").filter({ hasText: "Weekly vegetables" });
  await expect(row).toContainText("Bazaar");
});
